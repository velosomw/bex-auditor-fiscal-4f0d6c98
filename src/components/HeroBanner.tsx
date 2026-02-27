import { motion } from "framer-motion";
import wavesVideo from "@/assets/solutions-waves.mp4";

interface HeroBannerProps {
  title: string;
  subtitle: string;
  tag?: string;
  breadcrumbs?: { label: string; href?: string }[];
  videoSrc?: string;
}

const HeroBanner = ({ title, subtitle, tag, breadcrumbs, videoSrc }: HeroBannerProps) => {
  const video = videoSrc || wavesVideo;

  return (
    <section className="section-padding bg-background">
      <div className="max-w-7xl mx-auto">
        {breadcrumbs && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span>/</span>}
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-accent transition-colors">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-foreground font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="relative rounded-3xl overflow-hidden bg-primary min-h-[280px] md:min-h-[320px] flex">
          {/* Solid primary background — no video behind */}

          {/* Content left + Video card right */}
          <div className="relative z-10 flex-1 flex items-center">
            {/* Text */}
            <div className="flex-1 flex flex-col justify-center p-10 md:p-14 lg:p-16">
              {tag && (
                <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-3">
                  {tag}
                </p>
              )}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl md:text-5xl font-display font-bold text-primary-foreground mb-4"
              >
                {title}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-primary-foreground/70 max-w-md text-lg"
              >
                {subtitle}
              </motion.p>
            </div>

            {/* Video card — right side, floating */}
            <div className="hidden md:block relative mr-8 lg:mr-12 shrink-0">
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="w-[320px] lg:w-[400px] h-[200px] lg:h-[240px] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
              >
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                >
                  <source src={video} type="video/mp4" />
                </video>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
