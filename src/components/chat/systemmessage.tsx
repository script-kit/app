/* eslint-disable react/function-component-definition */
import React from 'react';

import classNames from 'classnames';
import { ISystemMessageProps } from 'react-chat-elements';

const SystemMessage: React.FC<ISystemMessageProps> = (props) => {
  return (
    <div className={classNames('rce-container-smsg', props.className)}>
      <div className="rce-smsg">
        <div className="rce-smsg-text">{props.text}</div>
      </div>
    </div>
  );
};

export default SystemMessage;
