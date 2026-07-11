import type { MetaFunction } from "react-router";
import { useLocale } from "~/i18n/LocaleContext";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";

export const meta: MetaFunction = () => {
    return [{ title: "Counterscale Console" }];
};

export default function ConsoleOverview() {
    const { t } = useLocale();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    {t("console.overview.title")}
                </h1>
                <p className="text-muted-foreground mt-1">
                    {t("console.overview.subtitle")}
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {t("console.overview.sitesCard")}
                        </CardTitle>
                        <CardDescription>
                            {t("console.overview.sitesCardDesc")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild className="rounded-xl">
                            <a href="/console/sites">
                                {t("console.overview.gotoSites")}
                            </a>
                        </Button>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {t("console.overview.flowTitle")}
                        </CardTitle>
                        <CardDescription>
                            {t("console.overview.flowDesc")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-1">
                        <p>1. {t("console.overview.step1")}</p>
                        <p>2. {t("console.overview.step2")}</p>
                        <p>3. {t("console.overview.step3")}</p>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm sm:col-span-2 lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {t("console.overview.metricsLater")}
                        </CardTitle>
                        <CardDescription>
                            {t("console.overview.metricsLaterDesc")}
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        </div>
    );
}
