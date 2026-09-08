import { useEffect, useRef } from "react";

/**
 * What the machine does when it pays.
 *
 * Shells go up from the coin tray, hang, and burst over the glass. Canvas
 * rather than elements: a decent burst is a few hundred sparks with their own
 * velocity and fade, and that is a paint job, not a document.
 *
 * It runs only while there is something burning. A win starts the loop, the
 * last spark stops it, and between wins there is no frame being scheduled at
 * all — this sits over a machine somebody may leave open for an hour.
 */

/*
 * The settled recipe. Every number here was chosen by eye against the page.
 *
 * The three that move things are fractions of the canvas rather than pixels,
 * so the same show works over the glass and over the screen at the top — one
 * is three times the height of the other, and a burst tuned in pixels for the
 * big box is a puff of dust in the small one.
 */
const SHOW = {
  /** Downward pull, as a fraction of the height per second squared. */
  gravity: 0.74,
  /** How quickly a spark slows in air. */
  drag: 0.86,
  /** Seconds a spark burns for, before its own variation. */
  life: 1.15,
  /** How fast a shell climbs, as a fraction of the height per second. */
  climb: 1.76,
  /** The slowest and fastest a spark leaves a burst, as fractions of height. */
  slowest: 0.26,
  spread: 0.6,
  /** Sparks per burst. */
  sparks: 46,
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  hue: string;
  /** Trails behind it, so a spark reads as moving rather than as a dot. */
  tail: number;
}

interface Shell {
  x: number;
  y: number;
  vy: number;
  /** How high it is heading, in page coordinates. */
  burstAt: number;
  hue: string;
}

export function Fireworks({
  /**
   * Bumped once per win. A number rather than a boolean because two wins in a
   * row are two shows, and a flag that was already true would light nothing.
   */
  fire,
  /** How much of a show it deserves: one for a line, more for a jackpot. */
  scale = 1,
}: {
  fire: number;
  scale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* The live show, held outside React: this changes sixty times a second. */
  const show = useRef<{ shells: Shell[]; sparks: Spark[] }>({ shells: [], sparks: [] });
  const running = useRef(false);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d") ?? null;
    if (canvas === null || context === null) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The win is already said in words and lit on the glass. This is the
      // part that can go without taking any meaning with it.
      return;
    }
    if (fire === 0) {
      return;
    }

    let width = 0;
    let height = 0;
    let frame = 0;
    let last = performance.now();

    const size = () => {
      /*
       * Capped below the real device ratio, as the haze is. Sparks are small
       * bright dots; a retina buffer costs four times the fill for detail
       * nobody can see at this size and speed.
       */
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    /**
     * The colours to burn in, read off the cascade so the machine's own room
     * lights its own fireworks.
     */
    const palette = (): string[] => {
      const styles = getComputedStyle(document.documentElement);
      const pick = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;
      return [
        pick("--gr-color-neon-hi", "#ff86d4"),
        pick("--gr-color-neon-core", "#ffe8f7"),
        pick("--gr-color-chip", "#e0b048"),
        pick("--gr-color-neon", "#c9439e"),
      ];
    };

    const colours = palette();
    const rgba = (hex: string, alpha: number): string => {
      let value = hex.replace("#", "");
      if (value.length === 3) {
        value = `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
      }
      const number = Number.parseInt(value, 16);
      return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha.toFixed(3)})`;
    };

    size();

    /* Launched from along the bottom, the way they would leave the tray. */
    const launch = (count: number) => {
      for (let n = 0; n < count; n += 1) {
        show.current.shells.push({
          x: width * (0.16 + Math.random() * 0.68),
          y: height,
          vy: -SHOW.climb * height * (0.8 + Math.random() * 0.4),
          burstAt: height * (0.12 + Math.random() * 0.34),
          hue: colours[Math.floor(Math.random() * colours.length)] as string,
        });
      }
    };

    const burst = (shell: Shell) => {
      const sparks = Math.round(SHOW.sparks * (0.8 + Math.random() * 0.4));
      for (let n = 0; n < sparks; n += 1) {
        const angle = Math.random() * Math.PI * 2;
        /* Square-rooted so the sparks fill the sphere rather than ring it. */
        const speed = (SHOW.slowest + Math.sqrt(Math.random()) * SHOW.spread) * height;
        show.current.sparks.push({
          x: shell.x,
          y: shell.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: SHOW.life * (0.7 + Math.random() * 0.6),
          age: 0,
          hue: shell.hue,
          tail: 3 + Math.random() * 5,
        });
      }
    };

    const draw = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.05);
      last = now;
      const pull = SHOW.gravity * height;
      context.clearRect(0, 0, width, height);
      /* Added rather than painted over, so overlapping sparks burn brighter. */
      context.globalCompositeOperation = "lighter";

      for (let index = show.current.shells.length - 1; index >= 0; index -= 1) {
        const shell = show.current.shells[index] as Shell;
        shell.vy += pull * step;
        shell.y += shell.vy * step;
        if (shell.y <= shell.burstAt || shell.vy >= 0) {
          burst(shell);
          show.current.shells.splice(index, 1);
          continue;
        }
        context.beginPath();
        context.fillStyle = rgba(shell.hue, 0.9);
        context.arc(shell.x, shell.y, 2.2, 0, Math.PI * 2);
        context.fill();
      }

      for (let index = show.current.sparks.length - 1; index >= 0; index -= 1) {
        const spark = show.current.sparks[index] as Spark;
        spark.age += step;
        if (spark.age >= spark.life) {
          show.current.sparks.splice(index, 1);
          continue;
        }
        spark.vy += pull * step;
        spark.vx *= SHOW.drag ** (step * 60);
        spark.vy *= SHOW.drag ** (step * 60);
        spark.x += spark.vx * step;
        spark.y += spark.vy * step;

        const left = 1 - spark.age / spark.life;
        context.beginPath();
        context.strokeStyle = rgba(spark.hue, left * left);
        context.lineWidth = 2;
        context.lineCap = "round";
        context.moveTo(spark.x, spark.y);
        // A short streak back along its own travel: a dot cannot show speed.
        context.lineTo(spark.x - spark.vx * step * spark.tail, spark.y - spark.vy * step * spark.tail);
        context.stroke();
      }

      if (show.current.shells.length === 0 && show.current.sparks.length === 0) {
        // Nothing left burning: stop scheduling frames entirely.
        running.current = false;
        context.clearRect(0, 0, width, height);
        return;
      }
      frame = window.requestAnimationFrame(draw);
    };

    /* A line gets a couple; a jackpot gets a barrage. */
    launch(Math.max(2, Math.round(2 * scaleRef.current)));
    const later = window.setTimeout(() => launch(Math.round(2 * scaleRef.current)), 520);
    const later2 =
      scaleRef.current > 2 ? window.setTimeout(() => launch(3), 1080) : null;

    if (!running.current) {
      running.current = true;
      last = performance.now();
      frame = window.requestAnimationFrame(draw);
    }

    window.addEventListener("resize", size);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(later);
      if (later2 !== null) {
        window.clearTimeout(later2);
      }
      window.removeEventListener("resize", size);
      running.current = false;
      show.current = { shells: [], sparks: [] };
      context.clearRect(0, 0, width, height);
    };
  }, [fire]);

  /*
   * Hidden on the wrapper rather than on the canvas itself. The win is
   * already said in words on the screen above and drawn on the glass below,
   * so there is nothing here to announce — and aria-hidden belongs on
   * something that was never going to take focus.
   */
  return (
    <div className="fireworks" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
