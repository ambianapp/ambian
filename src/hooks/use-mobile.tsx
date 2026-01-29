import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

// Detect iOS device type for audio handling
// iPad needs Web Audio for volume control, iPhone should skip it for better background audio
export function useIOSDeviceType() {
  const [deviceType, setDeviceType] = React.useState<'iphone' | 'ipad' | 'other'>('other');

  React.useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const platform = (navigator.platform || '').toLowerCase();
    
    // Check for iPad - includes "ipad" in UA or is Mac with touch (iPad OS 13+)
    const isIPad = ua.includes('ipad') || 
      (platform === 'macintel' && navigator.maxTouchPoints > 1) ||
      (ua.includes('macintosh') && navigator.maxTouchPoints > 1);
    
    // Check for iPhone
    const isIPhone = ua.includes('iphone');
    
    if (isIPad) {
      setDeviceType('ipad');
    } else if (isIPhone) {
      setDeviceType('iphone');
    } else {
      setDeviceType('other');
    }
  }, []);

  return deviceType;
}
