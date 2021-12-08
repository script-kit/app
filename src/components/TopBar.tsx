import React, { useCallback, useEffect, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { useAtom } from 'jotai';
import { loadingAtom } from '../jotai';

export default function TopBar() {
  const [loading] = useAtom(loadingAtom);
  const controls = useAnimation();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (loading) {
      setHidden(false);
      controls.start({
        left: ['-15%', '100%'],
      });
    }
  }, [loading]);

  const onAnimationEnd = useCallback(() => {
    if (!loading) {
      setHidden(true);
      controls.stop();
    }
  }, []);

  return (
    !hidden && (
      <motion.div
        animate={{ opacity: loading ? [0, 1] : [1, 0] }}
        className={`
      pointer-events-none absolute top-0 left-0 w-full`}
        onAnimationEnd={onAnimationEnd}
      >
        <motion.div
          initial={false}
          animate={controls}
          transition={{
            repeat: Infinity,
            repeatType: 'reverse',
            duration: window.innerWidth < 400 ? 1.5 : 2.5,
          }}
          style={{ height: 2 }}
          className="bg-primary-dark dark:bg-primary-light h-full w-10 absolute top-0 left-0"
        />
      </motion.div>
    )
  );
}
