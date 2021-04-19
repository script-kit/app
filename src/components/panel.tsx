import React from 'react';
import SimpleBar from 'simplebar-react';
import parse from 'html-react-parser';

interface PanelProps {
  panelHTML: string;
}

export default React.forwardRef(function Panel({ panelHTML }: PanelProps, ref) {
  return (
    <SimpleBar
      ref={ref}
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
        } as any
      }
      className="border-t dark:border-white dark:border-opacity-5 border-black border-opacity-5 px-4 py-4 flex flex-col w-full max-h-full overflow-y-scroll focus:border-none focus:outline-none outline-none"
    >
      {parse(panelHTML)}
    </SimpleBar>
  );
});
