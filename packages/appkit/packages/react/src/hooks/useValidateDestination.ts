/**
 * useValidateDestination — address blackhole prevention hook.
 *
 * The checks live in `@naculus/connect-appkit-core` (`validateDestination`),
 * shared with the Vue composable. This file only adds React and the
 * user-facing string for the machine-readable issue.
 *
 * Level: "ok" | "warning" | "blocked". "ok" means nothing wrong was found —
 * not that the destination is safe; see the core module for why.
 */

import {
  type AddressValidationLevel,
  validateDestination as validateDestinationCore,
} from "@naculus/connect-appkit-core";
import { useMemo } from "react";
import { t } from "../utils/i18n";

export type { AddressValidationLevel };

export interface AddressValidationResult {
  isValid: boolean;
  level: AddressValidationLevel;
  warning: string | null;
}

export function validateDestination(address: string): AddressValidationResult {
  const { isValid, level, issue } = validateDestinationCore(address);
  return { isValid, level, warning: issue ? t(`address.${issue}`) : null };
}

export interface UseValidateDestinationOptions {
  address: string;
}

export interface UseValidateDestinationReturn {
  validation: AddressValidationResult;
}

export function useValidateDestination({
  address,
}: UseValidateDestinationOptions): UseValidateDestinationReturn {
  const validation = useMemo(() => validateDestination(address), [address]);
  return { validation };
}
