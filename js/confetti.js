/* =====================================================================
 * NetScore — Lightweight confetti burst (no dependencies)
 * Exposes window.Confetti.fire(canvas, colors)
 * =================================================================== */
(function () {
  function fire(canvas, colors) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = canvas.clientWidth * DPR;
      canvas.height = canvas.clientHeight * DPR;
    }
    resize();
    window.addEventListener('resize', resize);

    colors = colors && colors.length ? colors : ['#38e07b', '#4f9dff', '#f9a03f', '#ff6b9d', '#c6e34d'];
    const W = () => canvas.width;
    const H = () => canvas.height;
    const N = 160;
    const parts = [];

    for (let i = 0; i < N; i++) {
      parts.push({
        x: W() / 2 + (Math.random() - 0.5) * W() * 0.5,
        y: H() * 0.35 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 14 * DPR,
        vy: (Math.random() * -12 - 4) * DPR,
        g: (0.28 + Math.random() * 0.2) * DPR,
        size: (6 + Math.random() * 8) * DPR,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[(Math.random() * colors.length) | 0],
        shape: Math.random() > 0.5 ? 'rect' : 'circ',
        life: 1
      });
    }

    let frames = 0;
    let raf;
    function tick() {
      frames++;
      ctx.clearRect(0, 0, W(), H());
      let alive = 0;
      for (const p of parts) {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.rot += p.vr;
        if (frames > 90) p.life -= 0.02;
        if (p.life <= 0 || p.y > H() + 40) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, W(), H());
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(raf);
      }
    }
    tick();
  }

  window.Confetti = { fire };
})();
