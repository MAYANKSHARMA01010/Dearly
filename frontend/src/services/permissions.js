/** Ask only after an explicit action and explanation. A blocked grant needs Settings.
 * @param {{granted:boolean,canAskAgain:boolean}} permission
 * @param {()=>Promise<{granted:boolean,canAskAgain:boolean}>} request
 * @param {()=>Promise<boolean>} explain
 * @returns {Promise<'granted'|'denied'|'blocked'|'canceled'>}
 */
export async function requestContextualPermission(permission, request, explain) {
  if (permission.granted) return 'granted';
  if (!permission.canAskAgain) return 'blocked';
  if (!await explain()) return 'canceled';
  const next = await request();
  return next.granted ? 'granted' : next.canAskAgain ? 'denied' : 'blocked';
}
