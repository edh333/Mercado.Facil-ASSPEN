import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { SystemRole } from "../types";

export function usePermissions(userId: string | undefined) {
  const [role, setRole] = useState<SystemRole>("operator");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setRole("operator");
      setLoading(false);
      return;
    }

    const userRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (!snap.exists()) {
        setRole("operator");
        setLoading(false);
        return;
      }
      const raw = snap.data().role || "operator";
      // Normalize legacy role values
      if (raw === "ADMIN" || raw === "admin" || raw === "master") setRole("admin");
      else if (raw === "manager") setRole("manager");
      else if (raw === "vendedor" || raw === "operator" || raw === "FAMILY") setRole("operator");
      else setRole("operator");
      setLoading(false);
    }, (err) => {
      console.error("[usePermissions] erro ao escutar role:", err);
      setRole("operator");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const canAccess = (allowedRoles: SystemRole[]) => allowedRoles.includes(role);

  return { role, canAccess, loading };
}
