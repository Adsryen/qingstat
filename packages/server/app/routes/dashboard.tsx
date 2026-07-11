import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/** @deprecated use /console/sites/:siteId/analytics */
export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const site = url.searchParams.get("site");
    if (site) {
        const next = new URL(
            `/console/sites/${encodeURIComponent(site)}/analytics`,
            url.origin,
        );
        // preserve non-site query params (interval, filters)
        url.searchParams.forEach((value, key) => {
            if (key !== "site") next.searchParams.set(key, value);
        });
        throw redirect(next.pathname + next.search);
    }
    throw redirect("/console");
}

export default function DashboardRedirect() {
    return null;
}
