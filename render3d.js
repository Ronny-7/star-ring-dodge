(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.starRingRender3d = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const projection = (typeof module === "object" && module.exports)
    ? require("./projection.js")
    : (typeof globalThis !== "undefined" ? globalThis : this).starRingProjection;

  const { projectPoint, distanceFade } = projection;

  const LIGHT = { x: -0.42, y: -0.48 };

  const SHIP_SHAPES = {
    default: { wingSpan: 1.45, wingRoot: 0.32, nose: 1.05, tail: 0.55 },
    delta: { wingSpan: 1.65, wingRoot: 0.28, nose: 0.95, tail: 0.5 },
    saucer: { wingSpan: 1.3, wingRoot: 1.2, nose: 0.55, tail: 0.55 }
  };

  function rgba(rgb, alpha) {
    return `rgba(${rgb},${alpha})`;
  }

  function drawBackground(ctx, { width, height, region, fogStrength }) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#02040c");
    gradient.addColorStop(0.55, `rgba(${region.tint},0.05)`);
    gradient.addColorStop(1, "#050914");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (fogStrength > 0) {
      const haze = ctx.createRadialGradient(width / 2, height * 0.42, 0, width / 2, height * 0.42, height * 1.1);
      haze.addColorStop(0, `rgba(${region.secondaryTint},${0.16 * fogStrength})`);
      haze.addColorStop(1, "rgba(2,4,12,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function drawStars(ctx, { stars, camera, tuning, speedScale }) {
    ctx.save();
    for (const star of stars) {
      const p = projectPoint(star, camera);
      if (!p.visible) continue;
      const fade = distanceFade(p.depth, tuning.fogStart, tuning.fogRange);
      if (fade <= 0.02) continue;
      const radius = Math.max(0.4, star.size * p.scale);
      ctx.fillStyle = rgba(star.tint, star.alpha * fade);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function projectLaneRing(z, halfWidth, halfHeight, camera) {
    const corners = [
      { x: -halfWidth, y: halfHeight, z },
      { x: halfWidth, y: halfHeight, z },
      { x: halfWidth, y: -halfHeight, z },
      { x: -halfWidth, y: -halfHeight, z }
    ].map((corner) => projectPoint(corner, camera));
    return corners.every((corner) => corner.visible) ? corners : null;
  }

  function drawLane(ctx, { camera, tuning, laneOffset, region, pulseTime }) {
    const spacing = tuning.laneRingSpacing;
    // Rings scroll toward the player, so the depth ruler itself reads as motion.
    const scroll = ((laneOffset % spacing) + spacing) % spacing;
    ctx.save();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 8; i += 1) {
      const z = i * spacing - scroll + 40;
      if (z < 20 || z > tuning.farDistance) continue;
      const corners = projectLaneRing(z, tuning.laneHalfWidth, tuning.laneHalfHeight, camera);
      if (!corners) continue;
      const fade = distanceFade(z, tuning.fogStart, tuning.fogRange);
      if (fade <= 0.02) continue;
      const strength = fade * (0.22 + 0.16 * Math.sin(pulseTime * 2 + i));
      ctx.strokeStyle = rgba(region.tint, strength);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let k = 1; k < corners.length; k += 1) ctx.lineTo(corners[k].x, corners[k].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function asteroidScreenRadius(asteroid, p) {
    return asteroid.radius * p.scale;
  }

  function drawAsteroid(ctx, { asteroid, p, fade, pulseTime }) {
    const r = asteroidScreenRadius(asteroid, p);
    if (r < 0.6) return;

    const lightX = p.x + LIGHT.x * r;
    const lightY = p.y + LIGHT.y * r;
    const body = ctx.createRadialGradient(lightX, lightY, r * 0.05, p.x, p.y, r * 1.05);
    const base = asteroid.surfaceTone;
    body.addColorStop(0, `rgba(${asteroid.mineralTint},${Math.min(1, 0.82 * base) * fade})`);
    body.addColorStop(0.42, `rgba(96,108,132,${0.9 * fade})`);
    body.addColorStop(0.76, `rgba(42,50,68,${0.95 * fade})`);
    body.addColorStop(1, `rgba(8,12,22,${fade})`);

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // Craters: squash toward the limb so the surface reads as curved.
    ctx.globalAlpha = fade * 0.55;
    for (const crater of asteroid.craters) {
      const localX = crater.x * Math.cos(asteroid.rotation) - crater.y * Math.sin(asteroid.rotation);
      const localY = crater.x * Math.sin(asteroid.rotation) + crater.y * Math.cos(asteroid.rotation);
      const nx = (localX / (asteroid.radius || 1)) * 1.9;
      const ny = (localY / (asteroid.radius || 1)) * 1.9;
      const d2 = nx * nx + ny * ny;
      if (d2 > 0.82) continue;
      const squash = 0.35 + 0.65 * Math.sqrt(1 - d2);
      ctx.fillStyle = `rgba(6,10,20,${0.5 * crater.shade})`;
      ctx.beginPath();
      ctx.ellipse(p.x + nx * r, p.y + ny * r, crater.r * p.scale * squash * 1.5, crater.r * p.scale * squash * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Terminator limb and rim light.
    ctx.lineWidth = Math.max(0.8, r * 0.06);
    ctx.strokeStyle = `rgba(4,8,16,${0.85 * fade})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${asteroid.mineralTint},${0.5 * fade})`;
    ctx.lineWidth = Math.max(0.7, r * 0.05);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.96, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();

    if (asteroid.hitFlash > 0) {
      ctx.fillStyle = `rgba(214,246,255,${0.55 * asteroid.hitFlash * fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (asteroid.elite) {
      const ringPulse = 0.5 + 0.5 * Math.sin(pulseTime * 6);
      ctx.strokeStyle = `rgba(${asteroid.mineralTint},${(0.5 + ringPulse * 0.4) * fade})`;
      ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCore(ctx, { core, p, fade, pulseTime }) {
    const r = Math.max(1.5, core.radius * p.scale);
    const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 4 + core.x * 0.01);
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.1);
    glow.addColorStop(0, `rgba(150,255,226,${0.9 * fade})`);
    glow.addColorStop(0.34, `rgba(98,228,255,${0.42 * fade})`);
    glow.addColorStop(1, "rgba(98,228,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 3.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(226,255,252,${(0.8 + pulse * 0.2) * fade})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * (0.72 + pulse * 0.14), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPowerUp(ctx, { powerUp, p, fade, pulseTime }) {
    const r = Math.max(1.5, powerUp.radius * p.scale);
    const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 5);
    const tint = powerUp.type === "shield" ? "138,255,209" : "255,181,158";
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    glow.addColorStop(0, `rgba(${tint},${0.85 * fade})`);
    glow.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(pulseTime * 1.6);
    ctx.strokeStyle = `rgba(${tint},${(0.8 + pulse * 0.2) * fade})`;
    ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI / 2) * i;
      const px = Math.cos(angle) * r * (0.9 + pulse * 0.12);
      const py = Math.sin(angle) * r * (0.9 + pulse * 0.12);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawLaser(ctx, { laser, p, camera, fade }) {
    const tailPoint = projectPoint({ x: laser.x, y: laser.y, z: laser.z - 110 }, camera);
    ctx.strokeStyle = `rgba(150,240,255,${0.9 * fade})`;
    ctx.lineWidth = Math.max(1, 6 * p.scale);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tailPoint.visible ? tailPoint.x : p.x, tailPoint.visible ? tailPoint.y : p.y + 20);
    ctx.stroke();

    ctx.fillStyle = `rgba(234,253,255,${fade})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, 3.4 * p.scale), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticle(ctx, { particle, p, fade }) {
    const r = Math.max(0.4, particle.size * p.scale * 3);
    ctx.globalAlpha = fade * Math.min(1, particle.life * 2.4);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawEffectRing(ctx, { ring, p, fade }) {
    const r = Math.max(1, ring.radius * p.scale);
    ctx.globalAlpha = fade * Math.min(1, ring.life / Math.max(0.001, ring.maxLife));
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = Math.max(0.7, ring.lineWidth * p.scale * 2.4);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Third-person rear view: nose points into the screen, so we see the tail.
  function drawShip(ctx, { p, tuning, color, pulseTime, thrust, roll, pitch, invulnerable, shape }) {
    const unit = tuning.shipScale * p.scale;
    const wingSpan = shape ? shape.wingSpan : 1.45;
    const wingRoot = shape ? shape.wingRoot : 0.32;
    const nose = shape ? shape.nose : 1.05;
    const tail = shape ? shape.tail : 0.55;
    if (unit <= 0.5) return;
    const flicker = invulnerable && Math.floor(pulseTime * 18) % 2 === 0;

    ctx.save();
    ctx.translate(p.x, p.y + unit * 1.15);
    ctx.rotate(roll * tuning.shipRollStrength);
    ctx.globalAlpha = flicker ? 0.55 : 1;

    // Engine glow first so the hull sits on top of it.
    const glowRadius = unit * (0.75 + thrust * 0.5);
    const glow = ctx.createRadialGradient(0, unit * 0.55, 0, 0, unit * 0.55, glowRadius);
    glow.addColorStop(0, rgba(color.rgb, 0.75 + thrust * 0.25));
    glow.addColorStop(0.45, rgba(color.rgb, 0.3));
    glow.addColorStop(1, rgba(color.rgb, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, unit * 0.55, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    if (thrust > 0.05) {
      const plume = unit * (0.8 + thrust * 1.5);
      const plumeGradient = ctx.createLinearGradient(0, unit * 0.4, 0, unit * 0.4 + plume);
      plumeGradient.addColorStop(0, rgba(color.rgb, 0.85 * thrust));
      plumeGradient.addColorStop(1, rgba(color.rgb, 0));
      ctx.fillStyle = plumeGradient;
      ctx.beginPath();
      ctx.moveTo(-unit * 0.3, unit * 0.4);
      ctx.lineTo(unit * 0.3, unit * 0.4);
      ctx.lineTo(0, unit * 0.4 + plume);
      ctx.closePath();
      ctx.fill();
    }

    // Wings.
    const wingGradient = ctx.createLinearGradient(-unit, 0, unit, 0);
    wingGradient.addColorStop(0, rgba(color.rgb, 0.35));
    wingGradient.addColorStop(0.5, rgba(color.rgb, 0.9));
    wingGradient.addColorStop(1, rgba(color.rgb, 0.35));
    ctx.fillStyle = wingGradient;
    ctx.beginPath();
    ctx.moveTo(-unit * wingSpan, unit * 0.42);
    ctx.lineTo(-unit * wingRoot, -unit * 0.42);
    ctx.lineTo(-unit * 0.2, unit * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(unit * wingSpan, unit * 0.42);
    ctx.lineTo(unit * wingRoot, -unit * 0.42);
    ctx.lineTo(unit * 0.2, unit * 0.5);
    ctx.closePath();
    ctx.fill();

    // Fuselage, foreshortened by pitch so banking reads correctly.
    const foreshorten = 1 - Math.min(0.34, Math.abs(pitch) * 0.6);
    const hull = ctx.createLinearGradient(0, -unit * nose * foreshorten, 0, unit * tail);
    hull.addColorStop(0, color.hi);
    hull.addColorStop(0.5, color.mid);
    hull.addColorStop(1, "#081428");
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(0, -unit * nose * foreshorten);
    ctx.lineTo(unit * 0.42, unit * 0.1);
    ctx.lineTo(unit * 0.26, unit * tail);
    ctx.lineTo(-unit * 0.26, unit * tail);
    ctx.lineTo(-unit * 0.42, unit * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba(color.rgb, 0.9);
    ctx.lineWidth = Math.max(0.8, unit * 0.05);
    ctx.stroke();

    ctx.restore();
  }

  function drawWarpGate(ctx, { gate, camera, tuning, pulseTime, lang }) {
    const z = gate.z;
    const fade = distanceFade(z, tuning.fogStart, tuning.fogRange);
    if (fade <= 0.02) return;
    const rx = tuning.routeGateRadius * 1.35;
    const ry = tuning.routeGateRadius;
    const left = projectPoint({ x: gate.x - rx, y: 0, z }, camera);
    const right = projectPoint({ x: gate.x + rx, y: 0, z }, camera);
    const top = projectPoint({ x: gate.x, y: ry, z }, camera);
    const bottom = projectPoint({ x: gate.x, y: -ry, z }, camera);
    if (!left.visible || !right.visible || !top.visible || !bottom.visible) return;

    const cx = (left.x + right.x) / 2;
    const cy = (top.y + bottom.y) / 2;
    const radiusX = Math.abs(right.x - left.x) / 2;
    const radiusY = Math.abs(bottom.y - top.y) / 2;
    const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 3);

    ctx.save();
    ctx.strokeStyle = rgba(gate.tint, (0.55 + pulse * 0.35) * fade);
    ctx.lineWidth = Math.max(1.5, radiusX * 0.09);
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();

    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusX);
    fill.addColorStop(0, rgba(gate.tint, 0.28 * fade));
    fill.addColorStop(1, rgba(gate.tint, 0.02 * fade));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `600 ${Math.max(9, radiusY * 0.42)}px "Segoe UI", sans-serif`;
    ctx.fillStyle = rgba(gate.tint, 0.95 * fade);
    ctx.textAlign = "center";
    ctx.fillText(gate.label, cx, cy - radiusY * 1.3);
    ctx.restore();
  }

  // Painter's algorithm: one bucket per drawable, far to near.
  function renderScene(ctx, { width, height, state, tuning, camera, region, lang, skin }) {
    const shape = SHIP_SHAPES[skin] || SHIP_SHAPES.default;
    drawBackground(ctx, {
      width,
      height,
      region,
      fogStrength: 1
    });
    drawStars(ctx, { stars: state.stars3d, camera, tuning });
    drawLane(ctx, {
      camera,
      tuning,
      laneOffset: state.laneOffset,
      region,
      pulseTime: state.pulseTime
    });

    const buckets = [
      { items: state.asteroids, draw: "asteroid" },
      { items: state.cores, draw: "core" },
      { items: state.powerUps, draw: "powerUp" },
      { items: state.lasers, draw: "laser" },
      { items: state.particles, draw: "particle" },
      { items: state.rings, draw: "ring" }
    ];

    const queue = [];
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        const p = projectPoint(item, camera);
        if (!p.visible) continue;
        const fade = distanceFade(p.depth, tuning.fogStart, tuning.fogRange);
        if (fade <= 0.02) continue;
        queue.push({ kind: bucket.draw, item, p, fade, depth: p.depth });
      }
    }
    queue.sort((a, b) => b.depth - a.depth);

    for (const entry of queue) {
      if (entry.kind === "asteroid") drawAsteroid(ctx, { asteroid: entry.item, p: entry.p, fade: entry.fade, pulseTime: state.pulseTime });
      else if (entry.kind === "core") drawCore(ctx, { core: entry.item, p: entry.p, fade: entry.fade, pulseTime: state.pulseTime });
      else if (entry.kind === "powerUp") drawPowerUp(ctx, { powerUp: entry.item, p: entry.p, fade: entry.fade, pulseTime: state.pulseTime });
      else if (entry.kind === "laser") drawLaser(ctx, { laser: entry.item, p: entry.p, camera, fade: entry.fade });
      else if (entry.kind === "particle") drawParticle(ctx, { particle: entry.item, p: entry.p, fade: entry.fade });
      else if (entry.kind === "ring") drawEffectRing(ctx, { ring: entry.item, p: entry.p, fade: entry.fade });
    }

    for (const gate of state.routeChoice.gates) {
      drawWarpGate(ctx, { gate, camera, tuning, pulseTime: state.pulseTime, lang });
    }

    const shipPoint = projectPoint({ x: state.player.x, y: state.player.y, z: 0 }, camera);
    if (shipPoint.visible) {
      drawShip(ctx, {
        p: shipPoint,
        tuning,
        color: state.shipColor,
        pulseTime: state.pulseTime,
        thrust: state.player.thrust,
        roll: state.player.roll || 0,
        pitch: state.player.pitch || 0,
        invulnerable: state.invulnerabilityTimer > 0,
        shape
      });
    }
  }

  return { renderScene, projectPoint, distanceFade };
});