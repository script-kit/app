import React, { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

export default function TopBar() {
  const controls = useAnimation();

  useEffect(() => {
    controls.start({
      left: ['-15%', '115%'],
      opacity: [0, 1, 0],
    });

    return () => {
      controls.stop();
    };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`
      pointer-events-none absolute top-0 left-0 w-screen h-0.5`}
    >
      <motion.div
        animate={controls}
        transition={{
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'reverse',

          duration: window.innerWidth < 400 ? 1.5 : 2.5,
        }}
        className="bg-primary-dark dark:bg-primary-light h-full w-10 absolute top-0 left-0"
      />
    </motion.div>
  );
}
