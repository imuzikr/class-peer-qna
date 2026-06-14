"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "./user";

export function useCurrentUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const syncUser = () => setUser(getCurrentUser());
    syncUser();
    window.addEventListener("role-change", syncUser);
    return () => window.removeEventListener("role-change", syncUser);
  }, []);

  return user;
}
