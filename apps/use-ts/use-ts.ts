import fs = require('fs');

import * as M from './use-more-ts';

console.log("TypeScript1.");

namespace UseTs {
  export var el = M.UseTs.arr[0];
  
  function toast(s : string) { }
  
  toast(fs.readFileSync("", 'utf-8'));
  
  [].map(() =>
    // a comment
    1
  );
}

//export var q = 0;