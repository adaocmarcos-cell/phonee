import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

type Direction = "up" | "left" | "right" | "scale";

interface RevealProps {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  direction?: Direction;
  delay?: number;
  distance?: number;
  duration?: number;
  className?: string;
  threshold?: number;
  once?: boolean;
}

/**
 * Lightweight scroll-reveal wrapper.
 * Uses IntersectionObserver — no extra deps.
 * Apple-style: fluid easing, subtle distances, GPU-accelerated transforms.
 */
export function Reveal({
  children,
  as: Tag = "div",
  direction = "up",
  delay = 0,
  distance,
  duration = 900,
  className = "",
  threshold = 0.15,
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced-motion preference
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  const d = distance ?? (direction === "scale" ? 0 : direction === "up" ? 48 : 64);
  const hiddenTransform =
    direction === "up"
      ? `translate3d(0, ${d}px, 0)`
      : direction === "left"
      ? `translate3d(-${d}px, 0, 0)`
      : direction === "right"
      ? `translate3d(${d}px, 0, 0)`
      : "scale(0.96)";

  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "translate3d(0,0,0) scale(1)" : hiddenTransform,
    transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    willChange: "opacity, transform",
  };

  // @ts-expect-error – generic tag ref typing
  return <Tag ref={ref} style={style} className={className}>{children}</Tag>;
}

/**
 * Subtle scroll-linked parallax. translateY proportional to scrollY * speed.
 * Use small speeds (0.05 – 0.2) for premium, restrained motion.
 */
export function useParallax(speed = 0.15) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setOffset(window.scrollY * speed));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed]);
  return offset;
}