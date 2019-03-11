/*******************************************************************************
 * Copyright 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *******************************************************************************/
'use strict';

var Probe = require('../lib/probe.js');
var aspect = require('../lib/aspect.js');
var util = require('util');

const cls = require('continuation-local-storage');
const openTracing = require('opentracing');

var serviceName;

function HttpProbeZipkin() {
  Probe.call(this, 'http');
  this.config = {
    filters: [],
  };
}
util.inherits(HttpProbeZipkin, Probe);

HttpProbeZipkin.prototype.attach = function(name, target) {
  serviceName = this.serviceName;

  const tracer = this.recorder;

  if (name == 'http') {
    if (target.__zipkinProbeAttached__) return target;
    target.__zipkinProbeAttached__ = true;
    var methods = ['on', 'addListener'];
  
    aspect.before(target.Server.prototype, methods,
      function(obj, methodName, args, probeData) {
        if (args[0] !== 'request') return;
        if (obj.__zipkinhttpProbe__) return;
        obj.__zipkinhttpProbe__ = true;
        aspect.aroundCallback(args, probeData, function(obj, args, probeData) {
          var httpReq = args[0];
          var res = args[1];
          // Filter out urls where filter.to is ''
          var traceUrl = parse(httpReq.url);
          // console.log(util.inspect(httpReq));
          if (traceUrl !== '') {
            const method = httpReq.method;
            const parentSpanContext = tracer.extract(openTracing.FORMAT_HTTP_HEADERS,
                                                     httpReq.headers);

            const span = tracer.startSpan('Inbound http:' + traceUrl, {
              childOf: parentSpanContext
            });
            // set any additional info (ex server address/port
            tracer.namespace.set('span', span);

            aspect.after(res, 'end', probeData, function(obj, methodName, args, probeData, ret) {
              // set res.statusCode.toString() as 'http.status_code';
              span.finish();
            });
          }
        }, undefined, tracer.namespace);
      }, undefined, tracer.namespace);
  }
  return target;
};
/*
 * Custom req.url parser that strips out any trailing query
 */
function parse(url) {
  ['?', '#'].forEach(function(separator) {
    var index = url.indexOf(separator);
    if (index !== -1) url = url.substring(0, index);
  });
  return url;
};


module.exports = HttpProbeZipkin;
