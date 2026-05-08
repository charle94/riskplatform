import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/pages/Dashboard";
import { FeatureDevelopment } from "./components/pages/FeatureDevelopment";
import { FeatureAnalysis } from "./components/pages/FeatureAnalysis";
import { FeatureLibrary } from "./components/pages/FeatureLibrary";
import { FeatureMonitoring } from "./components/pages/FeatureMonitoring";
import { RuleMining } from "./components/pages/RuleMining";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "feature-dev", Component: FeatureDevelopment },
      { path: "feature-analysis", Component: FeatureAnalysis },
      { path: "feature-library", Component: FeatureLibrary },
      { path: "monitoring", Component: FeatureMonitoring },
      { path: "rule-mining", Component: RuleMining },
    ],
  },
]);
