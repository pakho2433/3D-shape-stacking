window.addEventListener("load", function () {
  const loadingText = document.getElementById("loadingText");

  if (!window.THREE || !window.CANNON || !window.THREE.OrbitControls) {
    loadingText.textContent = "載入失敗，請檢查網絡後重新整理。";
    return;
  }

  try {
    startGame();
  } catch (error) {
    console.error(error);
    loadingText.textContent = "建立教具時發生錯誤。";
  }
});

function startGame() {
  const container = document.getElementById("scene");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcdde9);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  camera.position.set(6.5, 4.8, 7.4);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.7)
  );

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;

  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(
    camera,
    renderer.domElement
  );

  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 5.2;
  controls.maxDistance = 14;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.38;
  controls.target.set(0, 1.1, 0);

  const world = new CANNON.World();

  world.gravity.set(0, -9.82, 0);
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 18;

  const blockPhysicsMaterial =
    new CANNON.Material("block");

  const floorPhysicsMaterial =
    new CANNON.Material("floor");

  world.addContactMaterial(
    new CANNON.ContactMaterial(
      blockPhysicsMaterial,
      floorPhysicsMaterial,
      {
        friction: 0.72,
        restitution: 0.02
      }
    )
  );

  world.addContactMaterial(
    new CANNON.ContactMaterial(
      blockPhysicsMaterial,
      blockPhysicsMaterial,
      {
        friction: 0.64,
        restitution: 0.02
      }
    )
  );

  /* 柔和燈光，避免過曝 */

  const ambientLight = new THREE.AmbientLight(
    0xffffff,
    0.5
  );

  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(
    0xffffff,
    0.65
  );

  mainLight.position.set(5, 9, 6);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1536;
  mainLight.shadow.mapSize.height = 1536;
  mainLight.shadow.camera.left = -9;
  mainLight.shadow.camera.right = 9;
  mainLight.shadow.camera.top = 9;
  mainLight.shadow.camera.bottom = -9;
  mainLight.shadow.camera.near = 1;
  mainLight.shadow.camera.far = 25;
  mainLight.shadow.bias = -0.0004;

  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(
    0x92b8cb,
    0.18
  );

  fillLight.position.set(-5, 4, -4);
  scene.add(fillLight);

  /* 地台 */

  const platformBase = new THREE.Mesh(
    new THREE.BoxGeometry(10.8, 0.4, 6.8),
    new THREE.MeshLambertMaterial({
      color: 0x879aa7
    })
  );

  platformBase.position.y = -0.37;
  platformBase.receiveShadow = true;
  scene.add(platformBase);

  const platformTop = new THREE.Mesh(
    new THREE.BoxGeometry(10.3, 0.3, 6.3),
    new THREE.MeshLambertMaterial({
      color: 0xd5c9b2
    })
  );

  platformTop.position.y = -0.1;
  platformTop.receiveShadow = true;
  scene.add(platformTop);

  const grid = new THREE.GridHelper(
    10,
    12,
    0x776a58,
    0xa89980
  );

  grid.position.y = 0.06;

  if (Array.isArray(grid.material)) {
    grid.material.forEach(function (material) {
      material.transparent = true;
      material.opacity = 0.48;
    });
  } else {
    grid.material.transparent = true;
    grid.material.opacity = 0.48;
  }

  scene.add(grid);

  const floorBody = new CANNON.Body({
    mass: 0,
    material: floorPhysicsMaterial
  });

  floorBody.addShape(new CANNON.Plane());

  floorBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(1, 0, 0),
    -Math.PI / 2
  );

  world.addBody(floorBody);

  const objects = [];
  const pickableMeshes = [];

  const shapeNames = {
    cube: "正方體",
    cuboid: "長方體",
    prism: "三角柱",
    sphere: "球體"
  };

  const shapeColours = {
    cube: 0xd94f28,
    cuboid: 0x176bb4,
    prism: 0x7034ad,
    sphere: 0x0b854b
  };

  let selectedObject = null;
  let draggingObject = null;
  let testData = null;
  let lastTime = performance.now();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();

  function createMaterial(colour) {
    return new THREE.MeshLambertMaterial({
      color: colour
    });
  }

  function addEdges(mesh) {
    const edgeGeometry =
      new THREE.EdgesGeometry(mesh.geometry);

    const edgeMaterial =
      new THREE.LineBasicMaterial({
        color: 0x102c3e,
        transparent: true,
        opacity: 0.82
      });

    const edges = new THREE.LineSegments(
      edgeGeometry,
      edgeMaterial
    );

    edges.userData.isShapeEdge = true;
    mesh.add(edges);
  }

  function createPrismGeometry(width, height, depth) {
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;

    const positions = new Float32Array([
      -w, -h, -d,
       w, -h, -d,
       0,  h, -d,

      -w, -h,  d,
       w, -h,  d,
       0,  h,  d
    ]);

    const indices = [
      0, 2, 1,
      3, 4, 5,

      0, 1, 4,
      0, 4, 3,

      0, 3, 5,
      0, 5, 2,

      1, 2, 5,
      1, 5, 4
    ];

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  function createPrismPhysics(width, height, depth) {
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;

    const vertices = [
      new CANNON.Vec3(-w, -h, -d),
      new CANNON.Vec3(w, -h, -d),
      new CANNON.Vec3(0, h, -d),

      new CANNON.Vec3(-w, -h, d),
      new CANNON.Vec3(w, -h, d),
      new CANNON.Vec3(0, h, d)
    ];

    const faces = [
      [0, 2, 1],
      [3, 4, 5],
      [0, 1, 4, 3],
      [0, 3, 5, 2],
      [1, 2, 5, 4]
    ];

    return new CANNON.ConvexPolyhedron(
      vertices,
      faces
    );
  }

  function createShape(kind, x, y, z, rotationZ) {
    let geometry;
    let physicsShape;
    let mass;
    let defaultY;

    if (kind === "cube") {
      const size = 1.5;

      geometry = new THREE.BoxGeometry(
        size,
        size,
        size
      );

      physicsShape = new CANNON.Box(
        new CANNON.Vec3(
          size / 2,
          size / 2,
          size / 2
        )
      );

      mass = 1.1;
      defaultY = size / 2 + 0.03;
    }

    if (kind === "cuboid") {
      const width = 2.35;
      const height = 1.1;
      const depth = 1.4;

      geometry = new THREE.BoxGeometry(
        width,
        height,
        depth
      );

      physicsShape = new CANNON.Box(
        new CANNON.Vec3(
          width / 2,
          height / 2,
          depth / 2
        )
      );

      mass = 1.4;
      defaultY = height / 2 + 0.03;
    }

    if (kind === "prism") {
      const width = 1.9;
      const height = 1.6;
      const depth = 1.35;

      geometry = createPrismGeometry(
        width,
        height,
        depth
      );

      physicsShape = createPrismPhysics(
        width,
        height,
        depth
      );

      mass = 1.1;
      defaultY = height / 2 + 0.03;
    }

    if (kind === "sphere") {
      const radius = 0.78;

      geometry = new THREE.SphereGeometry(
        radius,
        32,
        22
      );

      physicsShape = new CANNON.Sphere(radius);

      mass = 0.8;
      defaultY = radius + 0.03;
    }

    if (!geometry || !physicsShape) {
      throw new Error("Unknown shape kind: " + kind);
    }

    const mesh = new THREE.Mesh(
      geometry,
      createMaterial(shapeColours[kind])
    );

    mesh.position.set(
      x || 0,
      y === undefined ? defaultY : y,
      z || 0
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    addEdges(mesh);
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: mass,
      material: blockPhysicsMaterial
    });

    body.addShape(physicsShape);

    body.position.set(
      mesh.position.x,
      mesh.position.y,
      mesh.position.z
    );

    if (rotationZ) {
      body.quaternion.setFromEuler(
        0,
        0,
        rotationZ
      );
    }

    body.linearDamping =
      kind === "sphere" ? 0.18 : 0.08;

    body.angularDamping =
      kind === "sphere" ? 0.16 : 0.12;

    body.allowSleep = true;
    body.sleepSpeedLimit = 0.08;
    body.sleepTimeLimit = 1;

    world.addBody(body);

    const object = {
      kind: kind,
      name: shapeNames[kind],
      mesh: mesh,
      body: body,
      mass: mass,
      rotation: rotationZ || 0,
      originalColour: shapeColours[kind]
    };

    mesh.userData.gameObject = object;

    objects.push(object);
    pickableMeshes.push(mesh);

    selectObject(object);

    return object;
  }

  function selectObject(object) {
    if (selectedObject) {
      selectedObject.mesh.material.color.setHex(
        selectedObject.originalColour
      );
    }

    selectedObject = object || null;

    if (selectedObject) {
      const highlighted = new THREE.Color(
        selectedObject.originalColour
      );

      highlighted.offsetHSL(0, 0.04, 0.1);

      selectedObject.mesh.material.color.copy(
        highlighted
      );

      document.getElementById(
        "selectedName"
      ).textContent = selectedObject.name;
    } else {
      document.getElementById(
        "selectedName"
      ).textContent = "未選取圖形";
    }
  }

  function removeObject(object) {
    if (!object) return;

    if (draggingObject === object) {
      draggingObject = null;
      controls.enabled = true;
    }

    world.removeBody(object.body);
    scene.remove(object.mesh);

    const objectIndex = objects.indexOf(object);

    if (objectIndex >= 0) {
      objects.splice(objectIndex, 1);
    }

    const meshIndex = pickableMeshes.indexOf(
      object.mesh
    );

    if (meshIndex >= 0) {
      pickableMeshes.splice(meshIndex, 1);
    }

    object.mesh.traverse(function (child) {
      if (child.geometry && child !== object.mesh) {
        child.geometry.dispose();
      }

      if (child.material && child !== object.mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (material) {
            material.dispose();
          });
        } else {
          child.material.dispose();
        }
      }
    });

    object.mesh.geometry.dispose();
    object.mesh.material.dispose();

    if (selectedObject === object) {
      selectedObject = null;

      document.getElementById(
        "selectedName"
      ).textContent = "未選取圖形";
    }
  }

  function clearAll(showMessage) {
    while (objects.length > 0) {
      removeObject(objects[0]);
    }

    testData = null;
    selectObject(null);

    if (showMessage !== false) {
      setStatus(
        "normal",
        "🧹",
        "已清除所有圖形",
        "按上方按鈕加入新的圖形。"
      );
    }
  }

  function createStartingScene() {
    clearAll(false);

    createShape(
      "cuboid",
      -1.7,
      0.58,
      0
    );

    createShape(
      "cube",
      -1.7,
      1.92,
      0
    );

    createShape(
      "prism",
      0.9,
      0.83,
      0
    );

    createShape(
      "sphere",
      3,
      0.81,
      0
    );

    selectObject(null);

    setStatus(
      "normal",
      "👆",
      "開始疊高高吧！",
      "拖動圖形，把它放到其他圖形上面。"
    );
  }

  function createStableDemo() {
    clearAll(false);

    createShape(
      "cuboid",
      0,
      0.58,
      0
    );

    createShape(
      "cube",
      0,
      1.9,
      0
    );

    createShape(
      "cube",
      0,
      3.43,
      0
    );

    selectObject(null);

    setStatus(
      "stable",
      "✅",
      "站得穩！",
      "較大和較平的圖形放在下面。"
    );
  }

  function createUnstableDemo() {
    clearAll(false);

    createShape(
      "sphere",
      0,
      0.81,
      0
    );

    createShape(
      "cuboid",
      0.15,
      2,
      0,
      0.08
    );

    createShape(
      "cube",
      0.65,
      3.35,
      0,
      0.15
    );

    selectObject(null);

    setStatus(
      "unstable",
      "⚠️",
      "可能會跌下來！",
      "球體會滾動，上面的圖形亦沒有放在中間。"
    );
  }

  function addNewShape(kind) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 1 + Math.random() * 1.7;

    const object = createShape(
      kind,
      Math.cos(angle) * distance,
      4.4,
      Math.sin(angle) * distance
    );

    object.body.velocity.set(0, -0.1, 0);

    setStatus(
      "normal",
      "➕",
      "已加入" + shapeNames[kind],
      "拖動圖形到合適的位置。"
    );
  }

  function rotateSelected() {
    if (!selectedObject) {
      setStatus(
        "normal",
        "👆",
        "請先選取圖形",
        "按一下想轉動的圖形。"
      );

      return;
    }

    if (selectedObject.kind === "sphere") {
      setStatus(
        "normal",
        "⚽",
        "球體每一面都一樣",
        "球體沒有平面，所以容易滾動。"
      );

      return;
    }

    selectedObject.rotation += Math.PI / 2;

    selectedObject.body.quaternion.setFromEuler(
      0,
      0,
      selectedObject.rotation
    );

    selectedObject.body.velocity.set(0, 0, 0);
    selectedObject.body.angularVelocity.set(0, 0, 0);
    selectedObject.body.wakeUp();

    setStatus(
      "normal",
      "↻",
      "已轉動" + selectedObject.name,
      "觀察不同的面能否站穩。"
    );
  }

  function setStatus(type, icon, title, message) {
    document.getElementById(
      "statusBox"
    ).className = type;

    document.getElementById(
      "statusIcon"
    ).textContent = icon;

    document.getElementById(
      "statusTitle"
    ).textContent = title;

    document.getElementById(
      "statusMessage"
    ).textContent = message;
  }

  function startTest() {
    if (objects.length === 0) {
      setStatus(
        "unstable",
        "❓",
        "還沒有圖形",
        "請先加入立體圖形。"
      );

      return;
    }

    releaseDraggedObject();

    testData = {
      startTime: performance.now(),
      duration: 2600,
      records: objects.map(function (object) {
        object.body.wakeUp();

        return {
          object: object,
          position: object.body.position.clone(),
          quaternion: object.body.quaternion.clone(),
          maximumSpeed: 0,
          maximumAngularSpeed: 0
        };
      })
    };

    setStatus(
      "testing",
      "🔍",
      "正在測試……",
      "觀察圖形會不會移動或跌下來。"
    );
  }

  function updateTest(now) {
    if (!testData) return;

    testData.records.forEach(function (record) {
      record.maximumSpeed = Math.max(
        record.maximumSpeed,
        record.object.body.velocity.length()
      );

      record.maximumAngularSpeed = Math.max(
        record.maximumAngularSpeed,
        record.object.body.angularVelocity.length()
      );
    });

    if (
      now - testData.startTime <
      testData.duration
    ) {
      return;
    }

    let unstable = false;
    let sphereRolled = false;
    let dropped = false;
    let tilted = false;

    testData.records.forEach(function (record) {
      const body = record.object.body;

      const horizontalDistance = Math.hypot(
        body.position.x - record.position.x,
        body.position.z - record.position.z
      );

      const dropDistance =
        record.position.y - body.position.y;

      const dot = Math.abs(
        record.quaternion.x * body.quaternion.x +
        record.quaternion.y * body.quaternion.y +
        record.quaternion.z * body.quaternion.z +
        record.quaternion.w * body.quaternion.w
      );

      const rotationDifference =
        2 *
        Math.acos(
          Math.min(
            1,
            Math.max(-1, dot)
          )
        );

      if (
        dropDistance > 0.3 ||
        body.position.y < -1
      ) {
        unstable = true;
        dropped = true;
      }

      if (horizontalDistance > 0.38) {
        unstable = true;
      }

      if (
        record.object.kind !== "sphere" &&
        rotationDifference > 0.38
      ) {
        unstable = true;
        tilted = true;
      }

      if (
        record.object.kind === "sphere" &&
        (
          horizontalDistance > 0.22 ||
          record.maximumAngularSpeed > 1.5
        )
      ) {
        unstable = true;
        sphereRolled = true;
      }

      if (
        record.maximumSpeed > 2.5 ||
        record.maximumAngularSpeed > 3.5
      ) {
        unstable = true;
      }
    });

    testData = null;

    if (!unstable) {
      setStatus(
        "stable",
        "✅",
        "站得穩！",
        "圖形沒有明顯移動。"
      );

      return;
    }

    let reason =
      "試試把較大和較平的圖形放在下面。";

    if (sphereRolled) {
      reason =
        "球體會滾動，不適合放在最下面。";
    } else if (dropped) {
      reason =
        "有圖形跌了下來，支撐面可能不夠大。";
    } else if (tilted) {
      reason =
        "有圖形傾斜，上面的圖形可能沒有放在中間。";
    }

    setStatus(
      "unstable",
      "⚠️",
      "會跌下來！",
      reason
    );
  }

  function updatePointer(event) {
    const rect =
      renderer.domElement.getBoundingClientRect();

    pointer.x =
      ((event.clientX - rect.left) /
        rect.width) *
        2 -
      1;

    pointer.y =
      -(
        (event.clientY - rect.top) /
        rect.height
      ) *
        2 +
      1;
  }

  function onPointerDown(event) {
    updatePointer(event);

    raycaster.setFromCamera(
      pointer,
      camera
    );

    const hits = raycaster.intersectObjects(
      pickableMeshes,
      false
    );

    if (hits.length === 0) return;

    event.preventDefault();

    const object =
      hits[0].object.userData.gameObject;

    if (!object) return;

    selectObject(object);

    draggingObject = object;
    testData = null;
    controls.enabled = false;

    if (renderer.domElement.setPointerCapture) {
      renderer.domElement.setPointerCapture(
        event.pointerId
      );
    }

    const body = object.body;

    body.type = CANNON.Body.KINEMATIC;
    body.mass = 0;
    body.updateMassProperties();
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);

    const dragHeight = Math.max(
      3.3,
      body.position.y + 1.5
    );

    dragPlane.set(
      new THREE.Vector3(0, 1, 0),
      -dragHeight
    );

    raycaster.ray.intersectPlane(
      dragPlane,
      dragPoint
    );

    dragOffset.set(
      body.position.x - dragPoint.x,
      0,
      body.position.z - dragPoint.z
    );

    body.position.y = dragHeight;
    body.aabbNeedsUpdate = true;

    setStatus(
      "normal",
      "✋",
      "正在移動" + object.name,
      "拖到合適位置後放手。"
    );
  }

  function onPointerMove(event) {
    if (!draggingObject) return;

    event.preventDefault();
    updatePointer(event);

    raycaster.setFromCamera(
      pointer,
      camera
    );

    if (
      !raycaster.ray.intersectPlane(
        dragPlane,
        dragPoint
      )
    ) {
      return;
    }

    const body = draggingObject.body;

    body.position.x = THREE.MathUtils.clamp(
      dragPoint.x + dragOffset.x,
      -4.4,
      4.4
    );

    body.position.z = THREE.MathUtils.clamp(
      dragPoint.z + dragOffset.z,
      -2.6,
      2.6
    );

    body.position.y = -dragPlane.constant;
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.aabbNeedsUpdate = true;
  }

  function releaseDraggedObject() {
    if (!draggingObject) return;

    const object = draggingObject;
    const body = object.body;

    body.type = CANNON.Body.DYNAMIC;
    body.mass = object.mass;
    body.updateMassProperties();

    body.velocity.set(0, -0.1, 0);
    body.angularVelocity.set(0, 0, 0);
    body.aabbNeedsUpdate = true;
    body.wakeUp();

    draggingObject = null;
    controls.enabled = true;

    setStatus(
      "normal",
      "👀",
      "已放下" + object.name,
      "觀察它能不能站穩。"
    );
  }

  function onPointerUp(event) {
    if (!draggingObject) return;

    if (
      renderer.domElement.releasePointerCapture
    ) {
      try {
        renderer.domElement.releasePointerCapture(
          event.pointerId
        );
      } catch (error) {
        console.debug("Pointer capture already released.", error);
      }
    }

    releaseDraggedObject();
  }

  renderer.domElement.addEventListener(
    "pointerdown",
    onPointerDown
  );

  renderer.domElement.addEventListener(
    "pointermove",
    onPointerMove
  );

  renderer.domElement.addEventListener(
    "pointerup",
    onPointerUp
  );

  renderer.domElement.addEventListener(
    "pointercancel",
    onPointerUp
  );

  document
    .querySelectorAll("[data-shape]")
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          addNewShape(
            button.getAttribute("data-shape")
          );
        }
      );
    });

  document
    .getElementById("testBtn")
    .addEventListener(
      "click",
      startTest
    );

  document
    .getElementById("stableBtn")
    .addEventListener(
      "click",
      createStableDemo
    );

  document
    .getElementById("unstableBtn")
    .addEventListener(
      "click",
      createUnstableDemo
    );

  document
    .getElementById("resetBtn")
    .addEventListener(
      "click",
      createStartingScene
    );

  document
    .getElementById("clearBtn")
    .addEventListener(
      "click",
      function () {
        clearAll(true);
      }
    );

  document
    .getElementById("rotateBtn")
    .addEventListener(
      "click",
      rotateSelected
    );

  document
    .getElementById("deleteBtn")
    .addEventListener(
      "click",
      function () {
        if (!selectedObject) {
          setStatus(
            "normal",
            "👆",
            "請先選取圖形",
            "按一下想刪除的圖形。"
          );

          return;
        }

        const name = selectedObject.name;

        removeObject(selectedObject);

        setStatus(
          "normal",
          "🗑",
          "已刪除" + name,
          "可以繼續加入其他圖形。"
        );
      }
    );

  function checkOutOfBounds() {
    objects.forEach(function (object) {
      const body = object.body;

      if (
        body.position.y < -5 ||
        Math.abs(body.position.x) > 9 ||
        Math.abs(body.position.z) > 7
      ) {
        body.position.set(0, 4, 0);
        body.quaternion.set(0, 0, 0, 1);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.wakeUp();
      }
    });
  }

  function animate(now) {
    requestAnimationFrame(animate);

    const delta = Math.min(
      (now - lastTime) / 1000,
      0.033
    );

    lastTime = now;

    world.step(
      1 / 60,
      delta,
      4
    );

    objects.forEach(function (object) {
      object.mesh.position.copy(
        object.body.position
      );

      object.mesh.quaternion.copy(
        object.body.quaternion
      );
    });

    checkOutOfBounds();
    updateTest(now);
    controls.update();

    renderer.render(
      scene,
      camera
    );
  }

  function resize() {
    camera.aspect =
      window.innerWidth /
      window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        1.7
      )
    );
  }

  window.addEventListener(
    "resize",
    resize
  );

  createStartingScene();

  lastTime = performance.now();
  requestAnimationFrame(animate);

  setTimeout(function () {
    document
      .getElementById("loading")
      .classList.add("hide");
  }, 400);
}
