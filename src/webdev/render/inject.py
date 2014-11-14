
import json
from flask.templating import render_template_string



class InjectJsonObjectToHtml(object):
    
    EPILOG_TEMPLATE = """
    <script type="text/json" id="in">{{ in_data }}</script>
    <script type="text/javascript">
        in_data = JSON.parse ($('#in').text());
        app = angular.module('app', []);
        app.controller('InData',
          function($scope) {
            $scope.items = in_data;
          });
    </script>
"""
    
    def epilog(self, in_data):
        in_data_json = json.dumps(in_data)
        return render_template_string(self.EPILOG_TEMPLATE, in_data=in_data_json)
        