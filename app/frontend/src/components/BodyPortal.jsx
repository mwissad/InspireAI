import { createPortal } from 'react-dom';

export default function BodyPortal({ children }) {
  return createPortal(children, document.body);
}
