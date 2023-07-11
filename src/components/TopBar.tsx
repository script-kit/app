import React, { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

export default function TopBar() {
  const controls = useAnimation();

  useEffect(() => {
    controls.start({
      left: ['-25%', '100%'],
      opacity: [0, 1, 0],
    });

    return () => {
      controls.stop();
    };
  }, []);
  return (
    <div
      className={`
      pointer-events-none absolute top-0 left-0 -mt-2px h-0.75 w-screen

      `}
    >
      <motion.div
        animate={controls}
        transition={{
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'reverse',

          duration: window.innerWidth < 400 ? 1.5 : 2.5,
        }}
        className="absolute top-0 left-0 h-full w-1/4
        bg-gradient-to-r
        from-transparent via-primary to-transparent
        "
      />
    </div>
  );
}
