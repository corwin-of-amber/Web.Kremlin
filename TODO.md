# To Do

(might be managed better as issues; but this is more lightweight)

 * [cli] `-o` flag, which determines output bundle filename
   (in case of concatenated JS).
 * [qa] create a list of filenames for `run-tests` and a script for CI.
 * [qa] have the tests emit some output or do some asserts when executed 
   so the results can be checked for sanity.
 * [qa] a testing fixture that creates an empty project and makes sure
   Kremlin is installable from the dist bundles, incl. running the tests.
 * [addons] [vue] `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__`