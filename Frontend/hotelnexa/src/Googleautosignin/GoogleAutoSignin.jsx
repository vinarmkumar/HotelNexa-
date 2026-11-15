import { useEffect, useRef } from "react";

const scriptUrl = "https://accounts.google.com/gsi/client";

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${scriptUrl}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("Google sign-in could not be loaded.")), { once: true });
  });
}

export default function GoogleAutoSignin({ mode = "button", onCredential, onError }) {
  const buttonRef = useRef(null);
  const credentialHandler = useRef(onCredential);
  const errorHandler = useRef(onError);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isOneTapMode = mode === "one-tap" || mode === "auto";
  const configurationError = !clientId
    ? "Google sign-in needs VITE_GOOGLE_CLIENT_ID configuration."
    : "";

  useEffect(() => {
    credentialHandler.current = onCredential;
    errorHandler.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    if (!clientId) return undefined;

    let active = true;
    loadGoogleIdentityServices().then(() => {
      if (!active) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        auto_select: isOneTapMode,
        callback: (response) => {
          if (!response.credential) {
            errorHandler.current?.(new Error("Google did not return an account credential."));
            return;
          }
          Promise.resolve(credentialHandler.current?.(response.credential))
            .catch((error) => errorHandler.current?.(error));
        },
      });
      if ((mode === "button" || mode === "auto") && buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          width: Math.min(360, Math.max(250, buttonRef.current.clientWidth)),
          logo_alignment: "left",
        });
      }
      if (isOneTapMode) {
        window.google.accounts.id.prompt();
      }
    }).catch((error) => errorHandler.current?.(error));

    return () => {
      active = false;
      if (isOneTapMode) window.google?.accounts?.id?.cancel();
    };
  }, [clientId, isOneTapMode, mode]);

  if (mode === "one-tap") return null;
  return (
    <div className={`google-auth${mode === "auto" ? " google-auth-auto" : ""}`}>
      {configurationError ? <p className="google-auth-message" role="status">{configurationError}</p> : <div className="google-auth-button" ref={buttonRef} />}
    </div>
  );
}
