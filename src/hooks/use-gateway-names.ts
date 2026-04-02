import { useState, useEffect } from "react";

/**
 * Hook to manage gateway names stored in localStorage
 * Returns custom names if available, falls back to gateway ID
 * Automatically updates when localStorage changes
 */
export function useGatewayNames() {
    const [gatewayNames, setGatewayNames] = useState<Record<string, string>>({});

    // Load from localStorage on mount and listen for changes
    useEffect(() => {
        // Load initial values
        const saved = localStorage.getItem("gatewayNames");
        if (saved) {
            try {
                setGatewayNames(JSON.parse(saved));
            } catch {
                console.error("Failed to parse gateway names from localStorage");
            }
        }

        // Listen for storage changes (works when modal or other components update localStorage)
        const handleStorageChange = () => {
            const updated = localStorage.getItem("gatewayNames");
            if (updated) {
                try {
                    setGatewayNames(JSON.parse(updated));
                } catch {
                    console.error("Failed to parse updated gateway names");
                }
            }
        };

        // Use custom event for updates within same tab (storage event only works across tabs)
        window.addEventListener("gateway-names-updated", handleStorageChange);
        window.addEventListener("storage", handleStorageChange);

        return () => {
            window.removeEventListener("gateway-names-updated", handleStorageChange);
            window.removeEventListener("storage", handleStorageChange);
        };
    }, []);

    // Get display name for a gateway (custom name or ID)
    const getGatewayName = (gatewayId: string): string => {
        return gatewayNames[gatewayId] || gatewayId;
    };

    // Save names to localStorage
    const saveGatewayNames = (names: Record<string, string>) => {
        localStorage.setItem("gatewayNames", JSON.stringify(names));
        setGatewayNames(names);
        // Dispatch custom event to notify other components in same tab
        window.dispatchEvent(new Event("gateway-names-updated"));
    };

    return {
        gatewayNames,
        getGatewayName,
        saveGatewayNames,
    };
}
