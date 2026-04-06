'use server';

import type { ConfigurableServiceName } from '@/src/server/runtime-config';

import {
  runLoginAction,
  runLogoutAction,
  runSetupAction,
} from './actions/auth-actions';
import {
  recoverRunConsoleAction,
  resetTransmissionCacheConsoleAction,
  runDryConsoleAction,
  runLiveConsoleAction,
  runSyncConsoleAction,
} from './actions/console-actions';
import {
  initialManualFetchActionState,
  runManualFetchAction,
  type ManualFetchActionState,
} from './actions/manual-fetch-action';
import {
  saveSettingsConsoleAction,
  testSettingsConnectionAction,
} from './actions/settings-actions';
import {
  clearAllMatchingSuppressionsConsoleAction,
  clearSelectedSuppressionsConsoleAction,
  clearSuppressionConsoleAction,
} from './actions/suppression-actions';

export async function loginAction(formData: FormData) {
  return runLoginAction(formData);
}

export async function setupAction(formData: FormData) {
  return runSetupAction(formData);
}

export async function logoutAction(formData: FormData) {
  return runLogoutAction(formData);
}

export async function runSyncAction(formData: FormData) {
  return runSyncConsoleAction(formData);
}

export async function runDryAction(formData: FormData) {
  return runDryConsoleAction(formData);
}

export async function runLiveAction(formData: FormData) {
  return runLiveConsoleAction(formData);
}

export async function recoverRunAction(formData: FormData) {
  return recoverRunConsoleAction(formData);
}

export async function resetTransmissionCacheAction(formData: FormData) {
  return resetTransmissionCacheConsoleAction(formData);
}

export async function clearSelectedSuppressionsAction(formData: FormData) {
  return clearSelectedSuppressionsConsoleAction(formData);
}

export async function clearAllMatchingSuppressionsAction(formData: FormData) {
  return clearAllMatchingSuppressionsConsoleAction(formData);
}

export async function clearSuppressionAction(
  suppressionId: number,
  formData: FormData
) {
  return clearSuppressionConsoleAction(suppressionId, formData);
}

export async function saveSettingsAction(formData: FormData) {
  return saveSettingsConsoleAction(formData);
}

export async function testConnectionAction(
  service: ConfigurableServiceName,
  formData: FormData
) {
  return testSettingsConnectionAction(service, formData);
}

export async function manualFetchAction(
  previousState: ManualFetchActionState = initialManualFetchActionState,
  formData: FormData
): Promise<ManualFetchActionState> {
  return runManualFetchAction(previousState, formData);
}
