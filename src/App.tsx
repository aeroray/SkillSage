import { BrowserRouter } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import { ToastProvider } from "./components/ui/toast";
import { TooltipProvider } from "./components/ui/tooltip";

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}

export default App;
