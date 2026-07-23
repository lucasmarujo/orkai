import type { CanvasNode } from '../ipc/types';
import { usePtySession } from './usePtySession';

export function TerminalNode({ node }: { node: CanvasNode }) {
  const hostRef = usePtySession(node.id);
  return <div ref={hostRef} className="terminal-host" />;
}
