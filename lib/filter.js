/**
* Filter.js adds data security for a doc. You may apply named profiles that determine which fields will be
* retrieved, to ensure that JSON sent to a user does not include inappropriate fields.
* Optionally, you may automatically sanitize HTML by adding sanitize: true to plugin initialization.
*
* Options:
*   readFilter         - Object mapping filtering profiles to string arrays of allowed fields.  Used when reading
*                        a doc - useful for GET queries that must return only selected fields.
*   writeFilter        - As above, but used when when applied during a PUT or POST.  This filters fields out of a given
*                        object so they will not be written even when specified.
*                        Useful for protected attributes like fb.accessToken.
*   defaultFilterRole  - Profile to use when one is not given, or the given profile does not exist.
*   sanitize           - True to automatically escape HTML in strings.
*
*
*
* This plugin adds the following statics to your schema:
*   getReadFilterKeys(filterRole)
*   getWriteFilterKeys(filterRole)
*   applyReadFilter(input, filterRole)
*   applyWriteFilter(input, filterRole)
*   _applyFilter(input, filterKeys)     // private helper
*   _getFilterKeys(type, filterRole)          // private helper
*
* and the following methods:
*   extendWithWriteFilter(input, filterRole)
*   applyReadFilter(filterRole)         // convenience method, calls statics.applyReadFilter
*   applyWriteFilter(filterRole)        // convenience method, calls statics.applyWriteFilter
*
* ----------                 ----------
* ---------- Getting Started ----------
* ----------                 ----------
*
* -----              -----
* ----- Environment: -----
* -----              -----
*
* var filter = require('mongoose-filter-denormalize').filter;
* var ObjectId = mongoose.Schema.ObjectId;
* var UserSchema = new Mongoose.schema({
*   name            :   String,
*   address         :   String,
*   fb              :  {
*       id              :   Number,
*       accessToken     :   String
*   },
*   writeOnlyField  :   String,
*   readOnlyField   :   String
* });
*
* UserSchema.plugin(filter, {
*   readFilter: {
*       "owner" : ['name', 'address', 'fb.id', 'fb.name', 'readOnlyField'],
*       "public": ['name', 'fb.name']
*   },
*   writeFilter: {
*       "owner" : ['name', 'address', 'fb.id', 'writeOnlyField']
*   },
*   defaultFilterRole: 'nofilter', // 'nofilter' is a built-in filter that does no processing, be careful with this
*   sanitize: true // Escape HTML in strings
* });
*
* -----               -----
* ----- Example read: -----
* -----               -----
*
* User.findOne({name: 'Foo Bar'}, User.getReadFilterKeys('public')), function(err, user){
*   if(err) next(err);
*   res.send({success: true, users: [user]});
* });
*
*
* -----                -----
* ----- Example write: -----
* -----                -----
*
* User.findById(req.params.id, function(err, user){
*   if(err) next(err);
*   if(user.id !== req.user.id) next(403);
*   user.extendWithWriteFilter(inputRecord, 'owner');  // Function added by plugin, similar to jQuery.extend()/Ext.extend()
*   user.save(function(err, user){
*       if(err) return next(err);
*       user.applyReadFilter('owner'); // Make sure the doc you return does not contain forbidden fields
*       res.send({success: true, users: [user]});
*   });
* });
*
*
*/

var mongoose    = require('mongoose'),
    _           = require('lodash'),
    sanitizer   = require('sanitizer');

module.exports = function filter(schema, options) {

    var defaults = {
        sanitize: false, // escapes HTML
        defaultFilterRole : 'nofilter'
    };

    options = _.extend(defaults, options);

    schema.statics.getReadFilterKeys = function(filterRole){
        var filters = this._getFilterKeys("readFilter", filterRole);
        return (filters ? filters.concat('_id') : filters).join(' '); // Always send _id property
    };

    schema.statics.getWriteFilterKeys = function(filterRole){
        return this._getFilterKeys("writeFilter", filterRole);
    };

    schema.statics._getFilterKeys = function(type, filterRole){
        var filter = {nofilter: null};
        _.extend(filter, options[type]);
        return filterRole in filter ? filter[filterRole] : filter[options.defaultFilterRole];
    };

    /**
     * When executing a 'put', this is called on the retrieved doc with given inputs.
     * It is the controller's job to define a filterRole, which determines
     * which properties of the doc may be overwritten.
     */
    schema.methods.extendWithWriteFilter = function(input, filterRole){
        input = this.constructor.applyWriteFilter(input, filterRole);
        _.extend(this, input);
    };

    /**
     * Helper for quickly applying a read filter.
     */
    schema.methods.applyReadFilter = function(filterRole){
        this._doc = this.constructor.applyReadFilter(this._doc, filterRole);
    };

    /**
     * Helper for quickly applying a write filter.
     */
    schema.methods.applyWriteFilter = function(filterRole){
        this._doc = this.constructor.applyWriteFilter(this._doc, filterRole);
    };

    /**
     * This will apply the read filter onto a given input or array of inputs.  Useful if you need to take out
     * properties the user is not supposed to see after an update or other complicated logic.
     * Use just before calling res.send.
     */
    schema.statics.applyReadFilter = function applyReadFilter(input, filterRole){
        if(_.isArray(input)){
            var ret = [];
            _.each(input, function(doc){
                ret.push(applyReadFilter(doc, filterRole));
            });
            return ret;
        }

        var filters = this.getReadFilterKeys(filterRole);
        return this._applyFilter(input, filters);
    };

    /**
     * Use this to manually apply a write filter on an input or array of inputs.
     * Note that this WILL DELETE ALL PROPERTIES NOT IN THE FILTER!
     * Do not use this on a doc before using doc.save(), as you will save it with filtered
     * properties missing - they will be overwritten with undefined.
     * Instead use methods.extendWithWriteFilter(input, filterRole), which only modifies allowed
     * properties but does not delete the rest.
     */
    schema.statics.applyWriteFilter = function applyWriteFilter(input, filterRole){
        if(_.isArray(input)){
            var ret = [];
            _.each(input, function(doc){
                ret.push(applyWriteFilter(doc, filterRole));
            });
            return ret;
        }

        // Sanitize strings
        if(options.sanitize){
            input = sanitizeObject(input);
        }
        var filterKeys = this._getFilterKeys('writeFilter', filterRole);
        return this._applyFilter(input, filterKeys);
    };


    /**
     * Applies a filter to a given object.
     */
    schema.statics._applyFilter = function _applyFilter(input, filters){
        if(filters === null) // no filter applied
            return input;

        var fieldKeys = _.keys(input),
            keysToRemove = [],
            schema = this;

        input = _.clone(input); // don't modify original object

        _.each(fieldKeys, function(key){  // search recursively for keys not matching the filter
            // We have an object, look through subobjects
            if(_.isObject(input[key]) && !_.isEmpty(input[key]) && !_.isArray(input[key]) && input[key]._bsontype !== "ObjectID"){
                var reducedFilters = [];
                if(_.include(filters, key)) // whole object is allowed in filter, don't bother diving in
                    return;

                // Find filters that may apply to this object's subfields
                _.each(filters, function(filter){
                    if(filter.indexOf(key) === 0)  // Look for filters of the format "object.field"
                        reducedFilters.push(filter.substring(key.length + 1));
                });

                // If some filters match, recusively call _applyFilter on this object
                if(reducedFilters.length > 0){
                    input[key] = _applyFilter(input[key], reducedFilters);
                } else {
                    keysToRemove.push(key); // No matches, delete the whole object
                }
            }

            else if(filters.indexOf(key) === -1) keysToRemove.push(key);

            // Remove empty string objectIDs, this causes problems on writes
            else if(input[key] === "" && _.isObject(schema.prototype.schema.paths[key]) &&
                    schema.prototype.schema.paths[key].instance === "ObjectID"){
                keysToRemove.push(key);
            }

        });

        _.each(keysToRemove, function(key){  // remove keys
            delete input[key];
        });

        return input;
    };

    /** Helpers **/
    function sanitizeObject(obj){
        _.each(obj, function(child, key){
            if(_.isObject(child))
                obj[key] = sanitizeObject(child);
            else if(_.isString(child))
                obj[key] = sanitizer.escape(child);
        });
        return obj;
    }

};
