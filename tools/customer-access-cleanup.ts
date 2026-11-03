/** Run from the trusted server environment. Dry run unless --execute is passed. */
import {
  createCustomerDependencies,
  customerServerConfig,
} from "../src/lib/leadmagnet/customer-access.server";
const config = customerServerConfig();
if (!config) throw new Error("Customer access server configuration is incomplete");
const { admin } = createCustomerDependencies(config);
const execute = process.argv.includes("--execute");
const { data, error } = await admin.rpc("lead_customer_access", {
  p_action: "cleanup_candidates",
  p_args: { reserve: execute },
});
if (error) throw new Error("Could not read expired submissions");
const rows = data as { id: string; path: string | null }[];
console.log(
  JSON.stringify({ expired: rows.length, files: rows.filter((r) => r.path).length, execute }),
);
if (execute) {
  const paths = rows.flatMap((r) => (r.path ? [r.path] : []));
  if (paths.length) {
    const result = await admin.storage.from("lead-design-files").remove(paths);
    if (result.error)
      throw new Error("File cleanup failed; database entries were retained for retry");
  }
  const result = await admin.rpc("lead_customer_access", {
    p_action: "cleanup_delete",
    p_args: { ids: rows.map((r) => r.id) },
  });
  if (result.error) throw new Error("Database cleanup failed; retry safely");
  console.log(JSON.stringify(result.data));
}
