import { setGlobalOptions } from 'firebase-functions/v2';
import { BAKED_DEPLOYMENT_PROVENANCE } from './generated/deploymentProvenance';
import { functionsProvenanceLabels, parseBakedDeploymentProvenance } from './deploymentProvenance';

setGlobalOptions({
  labels: functionsProvenanceLabels(parseBakedDeploymentProvenance(BAKED_DEPLOYMENT_PROVENANCE)),
});
