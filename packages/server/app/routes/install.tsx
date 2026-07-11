import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/** @deprecated use /console/sites/:siteId/code */
export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const site = url.searchParams.get("site");
    if (site) {
        throw redirect(`/console/sites/${encodeURIComponent(site)}/code`);
    }
    throw redirect("/console/sites");
}

export default function InstallRedirect() {
    return null;
}
