/**
 * What a firework is, wherever it is set off.
 *
 * Two shows run off this: the one over the glass, whose shells go up from the
 * coin tray, and the one over the page, whose shells leave the sides of the
 * cabinet. What differs between them is where a shell starts and which way it
 * is thrown. Everything after that — how it climbs, when it goes off, how a
 * spark fades — is the same firework, and lives here so that it stays the
 * same one. Two copies would be a machine whose inside and outside disagreed
 * about what a firework looks like.
 *
 * Canvas rather than elements: a decent burst is a few hundred sparks with
 * their own velocity and fade, and that is a paint job, not a document.
 */

/*
 * The settled recipe. Every number here was chosen by eye against the page.
 *
 * The three that move things are fractions of the canvas rather than pixels,
 * so the same show works over the glass, over the screen at the top, and over
 * the whole page — the largest is ten times the height of the smallest, and a
 * burst tuned in pixels for one is a puff of dust in the next.
 */
export const SHOW = {
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

export interface Spark {
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

export interface Shell {
  x: number;
  y: number;
  /**
   * Sideways travel. Zero for one going straight up off the tray, and the
   * whole point of one thrown out of the side of the machine.
   */
  vx: number;
  vy: number;
  /** How high it is heading, in canvas coordinates. */
  burstAt: number;
  hue: string;
}

/**
 * The colours to burn in, read off the cascade so the machine's own room
 * lights its own fireworks.
 */
export function palette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return [
    pick("--gr-color-neon-hi", "#ff86d4"),
    pick("--gr-color-neon-core", "#ffe8f7"),
    pick("--gr-color-chip", "#e0b048"),
    pick("--gr-color-neon", "#c9439e"),
  ];
}

export function rgba(hex: string, alpha: number): string {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
  }
  const number = Number.parseInt(value, 16);
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha.toFixed(3)})`;
}

/**
 * A show in progress: what is still climbing and what is still burning.
 *
 * Advancing and painting are two passes rather than one, because only the
 * first of them is about fireworks. The physics can then be run and asked
 * questions with no canvas anywhere near it, which is what lets the thing be
 * tested at all.
 */
export function burning() {
  const shells: Shell[] = [];
  const sparks: Spark[] = [];

  const burst = (shell: Shell, height: number) => {
    const count = Math.round(SHOW.sparks * (0.8 + Math.random() * 0.4));
    for (let n = 0; n < count; n += 1) {
      const angle = Math.random() * Math.PI * 2;
      /* Square-rooted so the sparks fill the sphere rather than ring it. */
      const speed = (SHOW.slowest + Math.sqrt(Math.random()) * SHOW.spread) * height;
      sparks.push({
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

  return {
    shells,
    sparks,
    launch(shell: Shell) {
      shells.push(shell);
    },
    advance(step: number, height: number) {
      const pull = SHOW.gravity * height;
      for (let index = shells.length - 1; index >= 0; index -= 1) {
        const shell = shells[index] as Shell;
        shell.vy += pull * step;
        shell.x += shell.vx * step;
        shell.y += shell.vy * step;
        /*
         * Off at its height or at the top of its arc, whichever comes first.
         * The second is not a fallback: a shell thrown sideways spends most of
         * its climb going outwards, and one that only ever burst at a height
         * would come back down as a dot.
         */
        if (shell.y <= shell.burstAt || shell.vy >= 0) {
          burst(shell, height);
          shells.splice(index, 1);
        }
      }
      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index] as Spark;
        spark.age += step;
        if (spark.age >= spark.life) {
          sparks.splice(index, 1);
          continue;
        }
        spark.vy += pull * step;
        spark.vx *= SHOW.drag ** (step * 60);
        spark.vy *= SHOW.drag ** (step * 60);
        spark.x += spark.vx * step;
        spark.y += spark.vy * step;
      }
    },
    paint(context: CanvasRenderingContext2D, step: number) {
      /* Added rather than painted over, so overlapping sparks burn brighter. */
      context.globalCompositeOperation = "lighter";
      for (const shell of shells) {
        context.beginPath();
        context.fillStyle = rgba(shell.hue, 0.9);
        context.arc(shell.x, shell.y, 2.2, 0, Math.PI * 2);
        context.fill();
      }
      for (const spark of sparks) {
        const left = 1 - spark.age / spark.life;
        context.beginPath();
        context.strokeStyle = rgba(spark.hue, left * left);
        context.lineWidth = 2;
        context.lineCap = "round";
        context.moveTo(spark.x, spark.y);
        // A short streak back along its own travel: a dot cannot show speed.
        context.lineTo(
          spark.x - spark.vx * step * spark.tail,
          spark.y - spark.vy * step * spark.tail,
        );
        context.stroke();
      }
    },
    alive() {
      return shells.length > 0 || sparks.length > 0;
    },
    clear() {
      shells.length = 0;
      sparks.length = 0;
    },
  };
}
