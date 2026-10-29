import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erreur lors de l'affichage de l'application.", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error" role="alert">
          <section>
            <h1>Impossible d’afficher votre espace</h1>
            <p>Une erreur est survenue pendant le chargement. Rechargez la page. Si le problème persiste, transmettez le message de la console au support, sans informations personnelles.</p>
            <button type="button" onClick={() => window.location.reload()}>Recharger la page</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
