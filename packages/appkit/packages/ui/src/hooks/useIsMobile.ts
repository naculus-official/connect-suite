"use client";

import { useState, useEffect } from "react";

/**
 * Hook that detects if the user is on a mobile device.
 * Returns true for iOS (iPhone, iPad, iPod) and Android devices.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    const ua = navigator.userAgent.toLowerCase();
    setMobile(/(iphone|ipad|ipod|android|mobile)/i.test(ua));
  }, []);

  return mobile;
}
