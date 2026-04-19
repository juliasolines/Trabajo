import * as THREE from 'three';

// 1. Setup Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0); 
scene.fog = new THREE.Fog(0xf0f0f0, 20, 200); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ'; 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// floor
const floorGeometry = new THREE.PlaneGeometry(2000, 2000);
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xe0e0e0 });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; 
floor.position.y = -5.1; 
scene.add(floor);

// audio listener
const listener = new THREE.AudioListener();
camera.add(listener); 

// 2. Movement 
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// WASD for walking
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

// Arrows for looking
let lookUp = false;
let lookDown = false;
let lookLeft = false;
let lookRight = false;

const speed = 40.0; 

// shader and holes
const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal; // NEW: We need to track the wall's direction
uniform float uTime;

void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normal; // Pass the direction to the fragment shader

    // Organic Wobble
    float wobble = sin(position.y * 0.2 + uTime) * cos(position.z * 0.2 + uTime);
    vec3 newPosition = position + normal * (wobble * 0.8);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D uTexture;
uniform vec3 uHubColor; 
uniform vec2 uOffset; // NEW: The randomizer seed
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal; // NEW: Receives the wall direction

float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123);
}

float noise (vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Add the random offset so each room calculates completely different noise
    vec3 pos = vPosition + vec3(uOffset.x, uOffset.y, uOffset.x);

    // Your original Hole Generation (using 'pos' instead of 'vPosition')
    float n = noise(pos.xz * 0.15 + pos.y * 0.1);
    
    // Your Rare, scattered tiny holes (< 10%)
    float tinyNoise = noise(pos.xz * 4.0 + pos.y * 3.0); 
    float scatterMask = noise(pos.xz * 0.3 + pos.y * 0.2); 
    float rareSpots = smoothstep(0.70, 0.85, scatterMask);
    n = n - (tinyNoise * rareSpots * 0.5);

    // --- NEW: THE INVITATION DOORWAY ---
    // vNormal.z < -0.5 mathematically isolates the specific wall facing the center point
    float doorMask = 0.0;
    if (vNormal.z < -0.5) {
        // Width: Opens up the middle of the wall, fading softly into the noise
        float doorWidth = smoothstep(8.0, 3.0, abs(vPosition.x)); 
        
        // Height: Completely open at the floor (-12.5), fading out as it goes up the wall
        float doorHeight = smoothstep(-2.0, -8.0, vPosition.y); 
        
        doorMask = doorWidth * doorHeight;
    }
    
    // Carve the doorway out of the noise (multiplied by 2.0 to ensure a clean cut to the floor)
    n -= doorMask * 2.0;
    // ------------------------------------

    float threshold = 0.45; 
    float edge = smoothstep(threshold - 0.1, threshold + 0.1, n);
    vec3 finalColor = mix(uHubColor, texColor.rgb, edge);

    if(edge < 0.05) discard; 

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// 4. Room Generator
function createMemoryRoom(imageFile, audioFile, x, z, rotationY) {
    const loader = new THREE.TextureLoader();
    const audioLoader = new THREE.AudioLoader();

    loader.load(imageFile, function(imgTexture) {
        imgTexture.wrapS = THREE.RepeatWrapping;
        imgTexture.wrapT = THREE.RepeatWrapping;

        const organicMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: imgTexture },
                uHubColor: { value: new THREE.Color(0xf0f0f0) },
                uTime: { value: 0.0 },
                // Generates a random starting position for the noise per room
                uOffset: { value: new THREE.Vector2(Math.random() * 1000.0, Math.random() * 1000.0) } 
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.DoubleSide
        });

        const geometry = new THREE.BoxGeometry(15, 10, 40, 30, 20, 60);
        const room = new THREE.Mesh(geometry, organicMaterial);

        room.position.set(x, 0, z);
        room.rotation.y = rotationY;
        
        room.userData.shaderMaterial = organicMaterial;
        scene.add(room);

        const sound = new THREE.PositionalAudio(listener);
        audioLoader.load(audioFile, function(buffer) {
            sound.setBuffer(buffer);
            sound.setRefDistance(10); 
            sound.setMaxDistance(80); 
            sound.setLoop(true);
            sound.setVolume(1.0);
            sound.play(); 
        });
        room.add(sound); 
    });
}

// 5. main space
const radius = 65; 
const totalRooms = 5;

for (let i = 0; i < totalRooms; i++) {
    const angle = (i / totalRooms) * Math.PI * 2;
    const x = radius * Math.sin(angle);
    const z = radius * Math.cos(angle);
    const rotation = angle; 

    createMemoryRoom(`room${i + 1}.jpg`, `audio${i + 1}.mp3`, x, z, rotation);
}

// 6. Controls and Title Screen 
let isActive = false; // Replaces PointerLockControls flag

const titleScreen = document.getElementById('title-screen');

if (titleScreen) {
    titleScreen.addEventListener('click', () => {
        titleScreen.classList.add('hidden');
        if (listener.context.state === 'suspended') {
            listener.context.resume();
        }
        setTimeout(() => {
            isActive = true; // Unlock the movement and camera
        }, 100);
    });
}

const onKeyDown = function (event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'ArrowUp': lookUp = true; break;
        case 'ArrowLeft': lookLeft = true; break;
        case 'ArrowDown': lookDown = true; break;
        case 'ArrowRight': lookRight = true; break;
    }
};
const onKeyUp = function (event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'ArrowUp': lookUp = false; break;
        case 'ArrowLeft': lookLeft = false; break;
        case 'ArrowDown': lookDown = false; break;
        case 'ArrowRight': lookRight = false; break;
    }
};
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

camera.position.set(0, -3, 0); 

// 7. Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); 
    const elapsedTime = clock.getElapsedTime();

    scene.traverse((object) => {
        if (object.isMesh && object.userData?.shaderMaterial?.uniforms?.uTime) {
            object.userData.shaderMaterial.uniforms.uTime.value = elapsedTime;
        }
    });

    if (isActive === true) {
        
        // Arrow head System ---
        const lookSpeed = 1.5 * delta;
        if (lookLeft) camera.rotation.y += lookSpeed;
        if (lookRight) camera.rotation.y -= lookSpeed;
        if (lookUp) camera.rotation.x += lookSpeed;
        if (lookDown) camera.rotation.x -= lookSpeed;
        
        // Clamp the pitch so the viewer can't look too far up/down
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));

        // WASD Movement System 
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        // walking direction relative to camera, keeping movement flat on the floor
        const right = new THREE.Vector3();
        right.setFromMatrixColumn(camera.matrix, 0);
        right.y = 0;
        right.normalize();

        const forward = new THREE.Vector3();
        forward.crossVectors(camera.up, right);
        forward.y = 0;
        forward.normalize();

        const distRight = -velocity.x * delta;
        const distForward = -velocity.z * delta;

        // Apply movement
        camera.position.addScaledVector(right, distRight);
        camera.position.addScaledVector(forward, distForward);

        camera.position.y = -3; 
    }

    renderer.render(scene, camera);
}
animate();
