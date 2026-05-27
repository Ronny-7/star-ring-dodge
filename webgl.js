(() => {
  const TAU = Math.PI * 2;

  function makeShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
    }
    return shader;
  }

  function makeProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, makeShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, makeShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
    }
    return program;
  }

  function mat4Identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function mat4Multiply(a, b) {
    const out = new Array(16);
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function mat4Translate(x, y, z) {
    const out = mat4Identity();
    out[12] = x;
    out[13] = y;
    out[14] = z;
    return out;
  }

  function mat4Scale(x, y, z) {
    const out = mat4Identity();
    out[0] = x;
    out[5] = y;
    out[10] = z;
    return out;
  }

  function mat4RotateZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function perspective(fovRadians, aspect, near, far) {
    const f = 1 / Math.tan(fovRadians / 2);
    const nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ];
  }

  function normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function lookAt(eye, target, up) {
    const z = normalize(subtract(eye, target));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ];
  }

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    return [
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255
    ];
  }

  function parseRgb(rgb) {
    return rgb.split(",").map((part) => Number(part.trim()) / 255);
  }

  function createMesh(gl, vertices) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    return { buffer, count: vertices.length / 9 };
  }

  function pushVertex(out, p, n, color) {
    out.push(p[0], p[1], p[2], n[0], n[1], n[2], color[0], color[1], color[2]);
  }

  function pushTri(out, a, b, c, color) {
    const normal = normalize(cross(subtract(b, a), subtract(c, a)));
    pushVertex(out, a, normal, color);
    pushVertex(out, b, normal, color);
    pushVertex(out, c, normal, color);
  }

  function createShipMesh(gl) {
    const c = [0.55, 0.88, 1];
    const dark = [0.08, 0.18, 0.34];
    const out = [];
    pushTri(out, [0, 34, 10], [-18, -22, -8], [18, -22, -8], c);
    pushTri(out, [0, 34, 10], [18, -22, -8], [0, -8, 18], [0.92, 0.98, 1]);
    pushTri(out, [0, 34, 10], [0, -8, 18], [-18, -22, -8], [0.36, 0.68, 1]);
    pushTri(out, [-18, -22, -8], [0, -8, 18], [18, -22, -8], dark);
    pushTri(out, [-12, -10, -5], [-42, -30, -10], [-16, -24, 4], [0.22, 0.44, 0.8]);
    pushTri(out, [12, -10, -5], [16, -24, 4], [42, -30, -10], [0.22, 0.44, 0.8]);
    return createMesh(gl, out);
  }

  function createPrismMesh(gl, sides = 10) {
    const out = [];
    const top = [];
    const bottom = [];
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * TAU;
      const r = 0.74 + ((i * 37) % 19) / 100;
      top.push([Math.cos(a) * r, Math.sin(a) * r, 0.5]);
      bottom.push([Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, -0.5]);
    }
    for (let i = 0; i < sides; i += 1) {
      const next = (i + 1) % sides;
      pushTri(out, [0, 0, 0.58], top[i], top[next], [0.56, 0.63, 0.74]);
      pushTri(out, [0, 0, -0.58], bottom[next], bottom[i], [0.13, 0.16, 0.22]);
      pushTri(out, top[i], bottom[i], bottom[next], [0.28, 0.33, 0.42]);
      pushTri(out, top[i], bottom[next], top[next], [0.42, 0.48, 0.58]);
    }
    return createMesh(gl, out);
  }

  function createRingMesh(gl, segments = 44) {
    const out = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * TAU;
      const b = ((i + 1) / segments) * TAU;
      const outerA = [Math.cos(a), Math.sin(a), 0.12];
      const innerA = [Math.cos(a) * 0.72, Math.sin(a) * 0.72, -0.12];
      const outerB = [Math.cos(b), Math.sin(b), 0.12];
      const innerB = [Math.cos(b) * 0.72, Math.sin(b) * 0.72, -0.12];
      pushTri(out, outerA, innerA, innerB, [0.32, 0.8, 1]);
      pushTri(out, outerA, innerB, outerB, [0.58, 0.98, 1]);
    }
    return createMesh(gl, out);
  }

  function createQuadMesh(gl) {
    const out = [];
    pushTri(out, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [1, 1, 1]);
    pushTri(out, [-0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0], [1, 1, 1]);
    return createMesh(gl, out);
  }

  function createLineMesh(gl, count) {
    return { buffer: gl.createBuffer(), count, dynamic: true };
  }

  class StarRingWebglRenderer {
    constructor(canvas, tuning) {
      this.canvas = canvas;
      this.tuning = tuning;
      this.gl = canvas?.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: false });
      this.available = Boolean(this.gl);
      if (!this.available) return;

      const gl = this.gl;
      const meshVs = `#version 300 es
        in vec3 aPosition;
        in vec3 aNormal;
        in vec3 aColor;
        uniform mat4 uModel;
        uniform mat4 uViewProjection;
        uniform vec3 uTint;
        uniform float uAlpha;
        out vec3 vColor;
        out vec3 vNormal;
        void main() {
          vec4 world = uModel * vec4(aPosition, 1.0);
          vNormal = mat3(uModel) * aNormal;
          vColor = aColor * uTint;
          gl_Position = uViewProjection * world;
        }
      `;
      const meshFs = `#version 300 es
        precision mediump float;
        in vec3 vColor;
        in vec3 vNormal;
        uniform vec3 uLight;
        uniform float uAlpha;
        out vec4 outColor;
        void main() {
          vec3 n = normalize(vNormal);
          float diffuse = max(dot(n, normalize(uLight)), 0.0);
          float rim = pow(1.0 - max(n.z, 0.0), 2.0) * 0.28;
          vec3 color = vColor * (0.28 + diffuse * 0.82) + rim;
          outColor = vec4(color, uAlpha);
        }
      `;
      const pointVs = `#version 300 es
        in vec3 aPosition;
        in vec3 aColor;
        in float aSize;
        uniform mat4 uViewProjection;
        uniform float uDpr;
        out vec3 vColor;
        void main() {
          vColor = aColor;
          gl_Position = uViewProjection * vec4(aPosition, 1.0);
          gl_PointSize = aSize * uDpr;
        }
      `;
      const pointFs = `#version 300 es
        precision mediump float;
        in vec3 vColor;
        out vec4 outColor;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float d = length(p);
          float alpha = smoothstep(0.5, 0.0, d);
          outColor = vec4(vColor, alpha);
        }
      `;

      this.meshProgram = makeProgram(gl, meshVs, meshFs);
      this.pointProgram = makeProgram(gl, pointVs, pointFs);
      this.meshLocations = {
        position: gl.getAttribLocation(this.meshProgram, "aPosition"),
        normal: gl.getAttribLocation(this.meshProgram, "aNormal"),
        color: gl.getAttribLocation(this.meshProgram, "aColor"),
        model: gl.getUniformLocation(this.meshProgram, "uModel"),
        viewProjection: gl.getUniformLocation(this.meshProgram, "uViewProjection"),
        tint: gl.getUniformLocation(this.meshProgram, "uTint"),
        light: gl.getUniformLocation(this.meshProgram, "uLight"),
        alpha: gl.getUniformLocation(this.meshProgram, "uAlpha")
      };
      this.pointLocations = {
        position: gl.getAttribLocation(this.pointProgram, "aPosition"),
        color: gl.getAttribLocation(this.pointProgram, "aColor"),
        size: gl.getAttribLocation(this.pointProgram, "aSize"),
        viewProjection: gl.getUniformLocation(this.pointProgram, "uViewProjection"),
        dpr: gl.getUniformLocation(this.pointProgram, "uDpr")
      };
      this.meshes = {
        ship: createShipMesh(gl),
        asteroid: createPrismMesh(gl, 12),
        ring: createRingMesh(gl),
        quad: createQuadMesh(gl)
      };
      this.pointBuffer = gl.createBuffer();
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
    }

    resize(width, height, dpr) {
      if (!this.available) return;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      const physW = Math.round(width * dpr);
      const physH = Math.round(height * dpr);
      if (this.canvas.width !== physW || this.canvas.height !== physH) {
        this.canvas.width = physW;
        this.canvas.height = physH;
      }
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.gl.viewport(0, 0, physW, physH);
    }

    worldToScene(x, y, z = 0) {
      return [x - this.width / 2, this.height / 2 - y, z];
    }

    getViewProjection() {
      const fov = (this.tuning.webglFov || 54) * Math.PI / 180;
      const aspect = Math.max(0.5, this.width / Math.max(1, this.height));
      const projection = perspective(fov, aspect, 1, 4200);
      const eye = [0, -(this.tuning.webglCameraDistance || 760), this.tuning.webglCameraHeight || 720];
      const view = lookAt(eye, [0, 0, 0], [0, 0, 1]);
      return mat4Multiply(projection, view);
    }

    makeModel(x, y, z, sx, sy, sz, rotation = 0) {
      return mat4Multiply(
        mat4Translate(x, y, z),
        mat4Multiply(mat4RotateZ(rotation), mat4Scale(sx, sy, sz))
      );
    }

    drawMesh(mesh, model, tint = [1, 1, 1], alpha = 1) {
      const gl = this.gl;
      const loc = this.meshLocations;
      gl.useProgram(this.meshProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      gl.enableVertexAttribArray(loc.position);
      gl.enableVertexAttribArray(loc.normal);
      gl.enableVertexAttribArray(loc.color);
      gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(loc.color, 3, gl.FLOAT, false, 36, 24);
      gl.uniformMatrix4fv(loc.model, false, new Float32Array(model));
      gl.uniformMatrix4fv(loc.viewProjection, false, new Float32Array(this.viewProjection));
      gl.uniform3fv(loc.tint, new Float32Array(tint));
      gl.uniform3fv(loc.light, new Float32Array([-0.32, -0.58, 0.74]));
      gl.uniform1f(loc.alpha, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    drawPoints(points) {
      if (!points.length) return;
      const gl = this.gl;
      const loc = this.pointLocations;
      gl.useProgram(this.pointProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc.position);
      gl.enableVertexAttribArray(loc.color);
      gl.enableVertexAttribArray(loc.size);
      gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 28, 0);
      gl.vertexAttribPointer(loc.color, 3, gl.FLOAT, false, 28, 12);
      gl.vertexAttribPointer(loc.size, 1, gl.FLOAT, false, 28, 24);
      gl.uniformMatrix4fv(loc.viewProjection, false, new Float32Array(this.viewProjection));
      gl.uniform1f(loc.dpr, this.dpr || 1);
      gl.drawArrays(gl.POINTS, 0, points.length / 7);
    }

    draw(state, region, colors, activeColor) {
      if (!this.available || !this.width || !this.height) return false;
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.viewProjection = this.getViewProjection();
      const regionTint = parseRgb(region.tint);
      const secondaryTint = parseRgb(region.secondaryTint);
      const pointData = [];
      const sceneDepth = this.tuning.webglSceneDepth || 900;

      for (const star of state.stars) {
        const depth = star.depth || 1;
        const p = this.worldToScene(star.x, star.y, -sceneDepth * depth);
        pointData.push(p[0], p[1], p[2], 0.72, 0.84, 1, (star.radius * 6 + 2) * depth);
      }

      for (const particle of state.particles) {
        const p = this.worldToScene(particle.x, particle.y, 18);
        const color = hexToRgb(particle.color || "#ffffff");
        pointData.push(p[0], p[1], p[2], color[0], color[1], color[2], Math.max(3, particle.size * 2));
      }

      this.drawPoints(pointData);

      const gridAlpha = 0.16 + Math.sin(state.pulseTime * 0.8) * 0.04;
      for (let i = 0; i < 5; i += 1) {
        const scale = 190 + i * 120;
        const model = this.makeModel(0, 0, -90 - i * 20, scale, scale * 0.58, 1, state.regionTimer * 0.018 + i * 0.11);
        this.drawMesh(this.meshes.ring, model, regionTint, gridAlpha);
      }

      for (const gate of state.routeChoice.gates) {
        const [x, y] = this.worldToScene(gate.x, gate.y, this.tuning.webglGateDepth || 80);
        const ageScale = Math.min(1, (gate.age || 0) / this.tuning.routeGateAppearDuration);
        const pulse = 1 + Math.sin(state.pulseTime * 6 + gate.x * 0.01) * 0.08;
        const model = this.makeModel(x, y, 60, gate.radius * 1.8 * ageScale * pulse, gate.radius * 1.8 * ageScale, 22, state.pulseTime * 1.4);
        this.drawMesh(this.meshes.ring, model, parseRgb(gate.tint), 0.82);
      }

      for (const core of state.cores) {
        const [x, y] = this.worldToScene(core.x, core.y, 34);
        const pulse = 1 + Math.sin(state.pulseTime * 7) * 0.12;
        const model = this.makeModel(x, y, 34, core.radius * pulse, core.radius * pulse, core.radius * 0.8, state.pulseTime);
        this.drawMesh(this.meshes.ring, model, [0.5, 0.92, 1], 0.94);
      }

      for (const power of state.powerUps) {
        const [x, y] = this.worldToScene(power.x, power.y, 38);
        const tint = power.type === "shield" ? [0.54, 1, 0.82] : [1, 0.7, 0.5];
        const model = this.makeModel(x, y, 38, power.radius * 1.1, power.radius * 1.1, power.radius * 0.5, state.pulseTime * 1.8);
        this.drawMesh(this.meshes.ring, model, tint, 0.9);
      }

      for (const laser of state.lasers) {
        const [x, y] = this.worldToScene(laser.x, laser.y, 50);
        const model = this.makeModel(x, y, 50, 5, 28, 5, laser.angle + Math.PI / 2);
        this.drawMesh(this.meshes.quad, model, [0.62, 0.96, 1], 0.92);
      }

      for (const asteroid of state.asteroids) {
        const [x, y] = this.worldToScene(asteroid.x, asteroid.y, 20);
        const depth = this.tuning.webglAsteroidDepth || 38;
        const hit = asteroid.hitFlash > 0;
        const tint = hit ? [1.25, 1.45, 1.55] : [1, 1, 1];
        const model = this.makeModel(x, y, 20, asteroid.radius, asteroid.radius, depth, -asteroid.rotation);
        this.drawMesh(this.meshes.asteroid, model, tint, 1);
      }

      const playerColor = colors[activeColor] ? parseRgb(colors[activeColor].rgb) : secondaryTint;
      const p = state.player;
      const [px, py] = this.worldToScene(p.x, p.y, this.tuning.webglShipHeight || 24);
      const shipModel = this.makeModel(px, py, this.tuning.webglShipHeight || 24, p.radius / 24, p.radius / 24, p.radius / 24, -p.angle - Math.PI / 2);
      this.drawMesh(this.meshes.ship, shipModel, playerColor, state.invulnerabilityTimer > 0 ? 0.72 : 1);

      if (state.shieldCharges > 0 || state.invulnerabilityTimer > 0) {
        const shieldTint = state.shieldCharges > 0 ? [0.54, 1, 0.82] : [0.58, 0.95, 1];
        const shieldModel = this.makeModel(px, py, 24, p.radius * 1.9, p.radius * 1.9, 18, state.pulseTime * 1.6);
        this.drawMesh(this.meshes.ring, shieldModel, shieldTint, 0.34);
      }

      return true;
    }
  }

  window.StarRingWebglRenderer = StarRingWebglRenderer;
})();
