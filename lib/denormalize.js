/**
* Adds denormalize functionality for a doc.
*
* This plugin has support for, but does not require, the mongoose-filter-plugin in the same package.
*
* Options:
*   exclude  (String[] or String) - References to never denormalize, even when explicitly asked
*   defaults (String[] or String) - References to denormalize when called without options.
*                                   Defaults to all refs (except those in 'exclude').  Useful to define
*                                   this if you have hasMany references that can easily get large.
*
* Example Usage:
*
* var denormalize = require('mongoose-denormalize-plugin');
* var ObjectId = mongoose.Schema.ObjectId;
* var UserSchema = new Mongoose.schema({
*   name            :   String,
*   transactions    :   [{type:ObjectId, ref:'Transaction'}],
*   address         :   {type:ObjectId, ref:'Address'},
*   tickets         :   [{type:ObjectId, ref:'Ticket'}],
*   bankaccount     :   {type:ObjectId, ref:'BankAccount'}
* });
*
* UserSchema.plugin(denormalize, {defaults: ['address', 'transactions', 'tickets'], exclude: 'bankaccount'});
*
* var opts = {refs: ["transactions", "address"], filter: "public"};  // Filter requires use of mongoose-filter-plugin
* opts.conditions = {address: {city : {$eq: "Seattle"}}};  // Only return the user if he is in Seattle
* User.findOne({name: 'Foo Bar'}).denormalize(opts).run(function(err, user){
*   if(err) return next(err);
*   res.send({success: true, users: [user]});
* });
*
* If you are building your array of refs to denormalize programmatically, make sure it returns
* an empty array if you do not want it to denormalize - falsy values will cause this plugin
* to use defaults.
*
*
*/

var mongoose    = require('mongoose'),
    _           = require('lodash');

module.exports = function denormalize(schema, options) {
    if(!options) options = {};
    var defaultRefs = _parseRefs(options.defaults),
        excludedRefs = _.flatten([options.exclude]);

    /**
     * Chains populate() calls together.  Requires model.getDenormalizationRefs(refs) to parse excludes
     * and defaults.
     */
    if(!mongoose.Query.prototype.denormalize){
        mongoose.Query.prototype.denormalize = function denormalize(opts) {
            var query = this,
                filter;

            if(!opts) opts = {options: {}};
            if(!opts.options) opts.options = {};
            if(!opts.conditions) opts.conditions = {};
            opts.options.suffix = options.suffix || "";

            if(_.isFunction(query.model.getDenormalizationRefs)){
                var refs = query.model.getDenormalizationRefs(opts.refs);
                _.each(refs, function(ref){
                    query.populate(ref, _getReadFilterKeys(ref, opts), opts.conditions[ref] || {}, opts.options);
                });
            }
            return this;

            function _getReadFilterKeys(ref, opts){
                var modelName = query.model.schema.path(ref).options.ref;
                var model = mongoose.model(modelName);
                if(_.isFunction(model.getReadFilterKeys)){
                    return model.getReadFilterKeys(opts.filter);
                }
            }
        };
    }

    /**
     * Used by query.denormalize
     */
    schema.statics.getDenormalizationRefs = function(refs){
        if(refs === 'false') return [];
        if(!refs || refs === 'true'){
            refs = defaultRefs;
        } else {
            refs = _parseRefs(refs);
        }
        return _filterExcludes(refs);
    };

    // -------- Private Functions -------------

    // Given refs, match to existing schema paths.
    function _parseRefs(refs){
        if(refs) refs = _.flatten([refs]);
        if(_.isEmpty(refs)) return _findAllRefs();

        var ret = [];

        // Make sure that each input given is a real ref
        _.each(refs, function(ref){
            if(_.isString(ref) && ref.length > 0){
                if(schema.paths[ref].instance === "ObjectID"){
                    ret.push(ref);
                }
            }
        });
        return ret;
    }

    function _filterExcludes(refsToDenormalize){
        var ret = _.filter(refsToDenormalize, function(ref){
            if(excludedRefs.indexOf(ref) === -1 && excludedRefs.indexOf(ref.replace(/_id$/, "")) === -1)
                return ref;
        });
        return ret;
    }

    // If no defaults are given, grab every ObjectId in this schema (except _id)
    function _findAllRefs(){
        var ret = [];
        _.each(schema.paths, function(path){
            if (path.instance === "ObjectID" && path.path !== "_id") {
                ret.push(path.path);
            }
        });
        return ret;
    }
};
