import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError() {
    return { error: "Erreur d’affichage inconnue." };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erreur lors de l'affichage de l'application.", error, errorInfo.componentStack);
    this.setState({ error: `${error.name}: ${error.message}` });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-error" role="alert">
          <section>
            <h1>Impossible d’afficher votre espace</h1>
            <p>Une erreur est survenue pendant le chargement. Rechargez la page. Si le problème persiste, transmettez le message de la console au support, sans informations personnelles.</p>
            <pre>{this.state.error}</pre>
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
