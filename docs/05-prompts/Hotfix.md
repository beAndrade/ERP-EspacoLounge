Follow the workflow defined in:

docs/00-governance/START-HERE.md

This task is a Hotfix.

The objective is to resolve a production or high-priority issue with the smallest possible change.

--------------------------------------------------

BEFORE CODING

Read only the documentation that is directly related to the affected feature.

Do NOT perform a full architecture review.

Analyze the problem first.

Identify:

- Root Cause
- Files involved
- Business impact
- Possible side effects

Explain your findings before making any changes.

--------------------------------------------------

HOTFIX PRINCIPLES

Implement the smallest possible fix.

Avoid unnecessary refactoring.

Do not improve unrelated code.

Do not rename files.

Do not rename folders.

Do not change architecture.

Do not modify business rules unless required to fix the issue.

Do not introduce new features.

The goal is stability.

--------------------------------------------------

IMPLEMENTATION

Modify only the files required to solve the problem.

Preserve existing behavior everywhere else.

Keep the solution simple and isolated.

--------------------------------------------------

VALIDATION

After implementation, verify:

- Build succeeds.
- No TypeScript errors.
- No console errors.
- The reported issue is fixed.
- Existing functionality still works.

--------------------------------------------------

OUTPUT

Generate a Hotfix Report containing:

Issue Summary

Root Cause

Files Modified

Solution Applied

Potential Risks

Regression Checks Performed

Documentation Updates (if any)

Technical Debt Identified (if any)

--------------------------------------------------

IMPORTANT

Do not automatically update documentation.

Only suggest documentation updates when necessary.

If the issue reveals an architectural problem, recommend creating a future refactoring task instead of solving it during the Hotfix.

Stop after the Hotfix is complete.