```sh
#!/bin/sh
# Run from the project root (/home/louis/Bootworks/Cataloguea).
# Removes stray flat copies left in automation/ and moves the two documents.

set -e

rm -f automation/Catalogued.js
rm -f automation/betkingPorts.js
rm -f automation/betkingSelectors.js
rm -f automation/canonicalBetTypes.js
rm -f automation/catalogueaAutomationPort.js
rm -f automation/catalogueaPagePort.js
rm -f automation/liverpoolPerspective.js
rm -f automation/operationalWorkflow.js
rm -f automation/operationalWorkflow.test.js
rm -f automation/resultPoller.js
rm -f automation/resultPoller.test.js
rm -f automation/rules.js
rm -f automation/rules.test.js
rm -f automation/seasonWeek.js
rm -f automation/seasonWeek.test.js
rm -f automation/settlementIntegration.js
rm -f automation/settlementIntegration.test.js
rm -f automation/strategyBridge.js
rm -f automation/strategyDecisionAdapter.js

if [ -f BETKING_WORKFLOW.md ]; then
  rm -f BETKING_WORKFLOW.md
fi

if [ -f PROJECT_AUDIT.md ]; then
  mv PROJECT_AUDIT.md automation/PROJECT_AUDIT.md
fi

echo 'cleanup done'
```