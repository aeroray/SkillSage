import { BrowserRouter } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
