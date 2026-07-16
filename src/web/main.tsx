import { createRoot } from "react-dom/client";
import "./theme.css";

function Placeholder() {
  return <p>torlink</p>;
}

createRoot(document.getElementById("root")!).render(<Placeholder />);
