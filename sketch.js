// Global variables for camera, shader, and environment map
let cam;
let myShader;
let envMapImg;

// Array to store pillar objects, and parameters for the grid layout
let pillars = [];
let rows = 30;         // number of rows of pillars
let cols = 30;         // number of columns of pillars
let spacing = 1;       // distance between each pillar
let maxHeight = 25.0;  // maximum height factor for the pillars

// Variables to define the scene center and camera positioning
let centerX = 0;
let centerY = 0;
let centerZ = 0;

let radius = 3000;        // distance from center for camera positioning
let elevationAngle;        // vertical angle of the camera
let azimuthAngle;          // horizontal angle of the camera
let camX, camY, camZ;      // camera coordinates

function preload() {
  // Load the custom shader and the environment map image before setup
  myShader = loadShader('vertex.vert', 'fragment.frag');
  envMapImg = loadImage('assets/environment.png');
}

function setup() {
  frameRate(120);                    // high frame rate for smooth animation
  createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();                        // no outlines on shapes

  computeSceneCenter();              // calculate centerX, centerY, centerZ
  setupCamera();                     // position and aim the camera
  
  initPillars();                     // create and initialize all the pillar data
  
  envMapImg.resize(1024, 512);       // resize environment map for better performance/quality
}

function draw() {
  background(20);                    // dark background for contrast
  shader(myShader);                  // use our custom shader for drawing

  setShaderUniforms();               // send all necessary uniform values to the shader

  orbitControl();                    // allow mouse dragging to orbit the camera
  scale(40);                         // scale up the scene for better viewing

  let allVertices = [];              // array to store all triangle vertices for pillars
  let dt = deltaTime / 1000.0;       // time elapsed since last frame in seconds

  // Map mouseX and mouseY to control wave parameters
  // freqMultiplier affects wave frequency based on horizontal mouse position
  let freqMultiplier = map(mouseX, 0, width, 0.1, 3.0);
  // ampMultiplier affects wave amplitude based on vertical mouse position
  let ampMultiplier = map(mouseY, 0, height, 0.1, 1.0);

  // Update pillar heights and transitions over time using the wave parameters
  updatePillars(dt, freqMultiplier, ampMultiplier);

  // Construct the actual 3D geometry for each pillar
  let currentTime = millis() / 1000.0;  // current time in seconds
  for (let p of pillars) {
    // Calculate rotation angle for this pillar based on position and time
    let angle = (p.x + p.z) * 0.1 + currentTime * 2.0 + (mouseX * 0.01);
    // Create the cube geometry for this pillar with the given height factor and rotation
    let cubeVerts = createCube(p.x, 0, p.z, p.currentHeightFactor, angle);
    // Add all its vertices to the main vertex array
    allVertices.push(...cubeVerts);
  }

  // Draw all the pillars' triangles
  drawPillars(allVertices);
}

function computeSceneCenter() {
  // Compute the center of the scene based on the grid dimensions and spacing
  // This ensures the grid of pillars is centered around (0,0,0)
  centerX = ((cols - 1) * spacing - (cols * spacing) / 2.0);
  centerZ = ((rows - 1) * spacing - (rows * spacing) / 2.0);
  centerY = 0; // flat plane, so centerY stays at zero
}

function setupCamera() {
  // Set camera angles for an angled top-down view
  elevationAngle = radians(-45);
  azimuthAngle = radians(sin(millis()) * 50);

  // Compute camera position in spherical-like coordinates
  camX = centerX + radius * cos(elevationAngle) * cos(azimuthAngle);
  camY = centerY + radius * sin(elevationAngle);
  camZ = centerZ + radius * cos(elevationAngle) * sin(azimuthAngle);

  // Create and position the camera, then make it look at the scene center
  cam = createCamera();
  cam.setPosition(camX, camY, camZ);
  cam.lookAt(centerX, centerY, centerZ);
  setCamera(cam);

  // Use an orthographic projection for a stylized, isometric-like view
  ortho(-width / 2, width / 2, -height / 2, height / 2, -100000, 100000);
}

function initPillars() {
  // Create a grid of pillars and initialize their height animation parameters
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Compute pillar position in world coordinates
      let x = col * spacing - (cols * spacing) / 2.0;
      let z = row * spacing - (rows * spacing) / 2.0;

      // Assign initial and target heights at random within the allowed maximum
      let startH = -random(1.0, maxHeight);
      let targetH = -random(1.0, maxHeight);
      // Each pillar has a random animation duration for height transitions
      let animationDuration = random(0.1, 0.33);

      // Store pillar data
      pillars.push({
        x: x,
        z: z,
        startHeightFactor: startH,
        targetHeightFactor: targetH,
        currentHeightFactor: startH,
        elapsedTime: 0.0,
        animationDuration: animationDuration
      });
    }
  }
}

function setShaderUniforms() {
  // Send various parameters to the shader as uniforms
  let currentTime = millis() / 1000.0;
  myShader.setUniform('time', currentTime);
  myShader.setUniform('uCamPos', [cam.eyeX, cam.eyeY, cam.eyeZ]);

  // Fresnel effect parameters
  myShader.setUniform('u_fresnel_speed', 1.0);
  myShader.setUniform('u_fresnel_tile', 15.0);

  // Lighting and environment parameters
  myShader.setUniform('uLightDir', [0.3, 0.5, 0.3]);
  myShader.setUniform('uSunLightDir', [26.7555 / 100, 89.4641 / 100, -30.95 / 100]);
  myShader.setUniform('uSunLightColor', rgbToFloat(255, 240, 207));
  myShader.setUniform('uMetalness', 0.7);
  myShader.setUniform('uRoughness', 0.1);
  myShader.setUniform('uSkyColor', rgbToFloat(200, 220, 255));
  myShader.setUniform('uGroundColor', rgbToFloat(180, 140, 120));
  myShader.setUniform('uAmbientStrength', 0.05);
  myShader.setUniform('uEnvMap', envMapImg);

  // A palette of colors for the shader to blend
  let palette = [
    rgbToFloat(255, 0, 0), 
    rgbToFloat(255, 242, 0), 
    rgbToFloat(0, 255, 8),
    rgbToFloat(0, 255, 238),
    rgbToFloat(111, 0, 255),
  ];
  myShader.setUniform('u_color', flattenColorArray(palette));
}

function updatePillars(dt, freqMultiplier, ampMultiplier) {
  // Update each pillar over time, adjusting their target heights based on layered waves
  let currentTime = millis() / 1000.0;
  for (let p of pillars) {
    p.elapsedTime += dt;
    let t = p.elapsedTime / p.animationDuration;

    // If the pillar reached its target height, pick a new target based on layered waves
    if (t >= 1.0) {
      p.startHeightFactor = p.targetHeightFactor;

      // Calculate wave values for this pillar
      // wave1: a slow, broad wave
      let wave1 = sin((p.x * 0.5 + p.z * 0.5 + currentTime * 3.0)) * 0.5 + 0.5;
      // wave2: influenced by mouse X (frequency)
      let wave2 = sin((p.x * 1.5 * freqMultiplier - p.z * 1.2 * freqMultiplier + currentTime * 8.0)) * 0.25 + 0.5;
      // wave3: influenced by mouse Y (amplitude)
      let wave3 = cos((p.z * 0.7 + currentTime * 5.0)) * (0.3 * ampMultiplier) + 0.5;

      // Combine the three waves into one value
      let combined = (wave1 + wave2 + wave3) / 3.0; 
      p.targetHeightFactor = -combined * maxHeight;

      // Reset animation timing
      p.elapsedTime = 0.0;
      t = 0.0;
    }

    // Apply easing to the height transition
    let easedT = easeInOutQuad(t);
    p.currentHeightFactor = p.startHeightFactor + (p.targetHeightFactor - p.startHeightFactor) * easedT;
  }
}

function drawPillars(allVertices) {
  // Draw all pillar triangles
  beginShape(TRIANGLES);
  for (let v of allVertices) {
    // v = [x, y, z, nx, ny, nz]
    normal(v[3], v[4], v[5]);  // set normal for correct lighting
    vertex(v[0], v[1], v[2]); // draw the vertex
  }
  endShape();
}

function rgbToFloat(r, g, b) {
  // Convert 0-255 RGB values to 0-1 floats for shader use
  return [r / 255, g / 255, b / 255];
}

function easeInOutQuad(t) {
  // Easing function for smooth height transitions
  return t < 0.5 ? 2.0 * t * t : -1.0 + (4.0 - 2.0 * t) * t;
}

function computeNormal(p1, p2, p3) {
  // Compute face normal from three points (p1, p2, p3)
  let U = [p2[0]-p1[0], p2[1]-p1[1], p2[2]-p1[2]];
  let V = [p3[0]-p1[0], p3[1]-p1[1], p3[2]-p1[2]];

  let Nx = (U[1]*V[2]) - (U[2]*V[1]);
  let Ny = (U[2]*V[0]) - (U[0]*V[2]);
  let Nz = (U[0]*V[1]) - (U[1]*V[0]);

  let len = sqrt(Nx*Nx + Ny*Ny + Nz*Nz);
  if (len > 0.0) {
    Nx /= len;
    Ny /= len;
    Nz /= len;
  }

  return [Nx, Ny, Nz];
}

function createCube(xOffset, yOffset, zOffset, heightFactor, angle) {
  // Define a cube, then rotate it around the Y-axis by 'angle', and then translate it
  const size = 1.0;
  const halfSize = size / 2;

  // Original cube corners before transformation
  let corners = [
    [-halfSize, -halfSize, -halfSize],
    [ halfSize, -halfSize, -halfSize],
    [ halfSize,  halfSize*heightFactor, -halfSize],
    [-halfSize,  halfSize*heightFactor, -halfSize],
    [-halfSize, -halfSize,  halfSize],
    [ halfSize, -halfSize,  halfSize],
    [ halfSize,  halfSize*heightFactor,  halfSize],
    [-halfSize,  halfSize*heightFactor,  halfSize],
  ];

  // Rotate cube around Y-axis
  let cosA = cos(angle);
  let sinA = sin(angle);
  corners = corners.map(c => {
    let X = c[0]*cosA - c[2]*sinA;
    let Z = c[0]*sinA + c[2]*cosA;
    return [X + xOffset, c[1] + yOffset, Z + zOffset];
  });

  // Define cube faces as sets of 4 indices referencing corners
  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 3, 7, 4],
    [1, 2, 6, 5],
  ];

  let outputVerts = [];
  // For each face, compute the normal and add two triangles (6 vertices total)
  for (const face of faces) {
    const [v1, v2, v3, v4] = face;
    let n = computeNormal(corners[v1], corners[v2], corners[v3]);
    outputVerts.push(...makeFace(corners, v1, v2, v3, v4, n));
  }

  return outputVerts;
}

function makeFace(corners, v1, v2, v3, v4, n) {
  // A face is composed of two triangles:
  // (v1, v2, v3) and (v1, v3, v4)
  return [
    [corners[v1][0], corners[v1][1], corners[v1][2], n[0], n[1], n[2]],
    [corners[v2][0], corners[v2][1], corners[v2][2], n[0], n[1], n[2]],
    [corners[v3][0], corners[v3][1], corners[v3][2], n[0], n[1], n[2]],

    [corners[v1][0], corners[v1][1], corners[v1][2], n[0], n[1], n[2]],
    [corners[v3][0], corners[v3][1], corners[v3][2], n[0], n[1], n[2]],
    [corners[v4][0], corners[v4][1], corners[v4][2], n[0], n[1], n[2]]
  ];
}

function flattenColorArray(arr) {
  // Flatten a 2D array of color triplets into a single float array
  let flat = [];
  for (let c of arr) {
    flat.push(c[0], c[1], c[2]);
  }
  return flat;
}

function windowResized() {
  // Adjust canvas and perspective if window is resized
  resizeCanvas(windowWidth, windowHeight);
  perspective(60 * PI/180, width/height, 0.1, 10000);
}
