import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/** @deprecated use /console/sites */
export async function loader(_args: LoaderFunctionArgs) {
    throw redirect("/console/sites");
}

export default function AdminRedirect() {
    return null;
}
