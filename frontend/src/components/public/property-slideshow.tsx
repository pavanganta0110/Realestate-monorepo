"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type PropertySlide = {
  src: string;
  alt: string;
  caption: string;
};

export function PropertySlideshow({
  slides,
  className,
  imageClassName,
  sizes,
  preload = false,
  tone = "light",
  label = "Missouri property gallery",
}: {
  slides: PropertySlide[];
  className?: string;
  imageClassName?: string;
  sizes: string;
  preload?: boolean;
  tone?: "light" | "brand";
  label?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, slides.length]);

  function showPrevious() {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % slides.length);
  }

  const controlsAreDark = tone === "brand";

  return (
    <section
      aria-label={label}
      aria-roledescription="carousel"
      className={cn("overflow-hidden", className)}
    >
      <div className={cn("relative min-h-[24rem] bg-secondary", imageClassName)}>
        {slides.map((slide, index) => (
          <Image
            key={slide.src}
            src={slide.src}
            alt={index === activeIndex ? slide.alt : ""}
            aria-hidden={index !== activeIndex}
            fill
            preload={preload && index === 0}
            sizes={sizes}
            className={cn(
              "object-cover transition-opacity duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]",
              index === activeIndex ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
      <div
        className={cn(
          "flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-5",
          controlsAreDark ? "bg-brand text-white" : "border-x border-b border-border bg-card text-foreground",
        )}
      >
        <p aria-live={paused || reducedMotion ? "polite" : "off"} className={cn("min-w-0 flex-1 break-words text-sm font-medium", controlsAreDark ? "text-white/78" : "text-muted-foreground")}>
          {slides[activeIndex]?.caption}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={showPrevious}
            className={cn("focus-ring flex size-10 items-center justify-center rounded-full", controlsAreDark ? "text-white hover:bg-white/10" : "hover:bg-secondary")}
            aria-label="Previous property image"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            className={cn("focus-ring flex size-10 items-center justify-center rounded-full", controlsAreDark ? "text-white hover:bg-white/10" : "hover:bg-secondary")}
            aria-label={paused ? "Play property slideshow" : "Pause property slideshow"}
            aria-pressed={paused}
          >
            {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={showNext}
            className={cn("focus-ring flex size-10 items-center justify-center rounded-full", controlsAreDark ? "text-white hover:bg-white/10" : "hover:bg-secondary")}
            aria-label="Next property image"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
