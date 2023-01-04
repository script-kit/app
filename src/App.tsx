import IpcBridge from './ipc-bridge';
import Container from './container';
import MonacoSetup from './monaco/Setup';

export default function App() {
  return (
    <div>
      <IpcBridge />
      <Container />
      <MonacoSetup />
    </div>
  );
}
