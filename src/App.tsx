import { BrowserRouter } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import { TooltipProvider } from "./components/ui/tooltip";

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </BrowserRouter>
  );
}

export default App;
