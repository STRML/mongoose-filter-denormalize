# Mongoose-Filter-Denormalize

Simple filtering and denormalization for Mongoose. Useful for REST APIs where you might not want to
send entire objects down the pipe. Allows you to store sensitive data directly on objects without worrying
about it being sent to end users.

## Installation

```
npm install mongoose-filter-denormalize
```

## Compatibility

`mongoose <= v3.4`

As of v3.6 Mongoose appears to have removed support for sending arrays of keys to `query.populate`
and `query.select`. As a result this library is not compatible. See #4. Please submit a PR if you have
time to fix this.

## Filter Usage

Filtering functionality is provided via a schema plugin.

### Schema

```javascript
var filter = require('mongoose-filter-denormalize').filter;
var ObjectId = mongoose.Schema.ObjectId;
var UserSchema = new Mongoose.schema({
  name            :   String,
  address         :   String,
  fb              :  {
      id              :   Number,
      accessToken     :   String
  },
  writeOnlyField  :   String,
  readOnlyField   :   String
});
UserSchema.plugin(filter, {
  readFilter: {
      "owner" : ['name', 'address', 'fb.id', 'fb.name', 'readOnlyField'],
      "public": ['name', 'fb.name']
  },
  writeFilter: {
      "owner" : ['name', 'address', 'fb.id', 'writeOnlyField']
  },
  // 'nofilter' is a built-in filter that does no processing, be careful with this
  defaultFilterRole: 'nofilter',
  sanitize: true // Escape HTML in strings
});
```

### Example Read

```javascript
User.findOne({name: 'Foo Bar'}, User.getReadFilterKeys('public')), function(err, user){
  if(err) return next(err);
  res.send({success: true, users: [user]});
});
```

### Example Write

```javascript
User.findById(req.params.id, function(err, user){
  if(err) next(err);
  if(user.id !== req.user.id) next(403);
  user.extendWithWriteFilter(inputRecord, 'owner');  // Similar to jQuery.extend()
  user.save(function(err, user){
      if(err) return next(err);
      user.applyReadFilter('owner'); // Make sure the doc you return does not contain forbidden fields
      res.send({success: true, users: [user]});
  });
});
```

### Options

- `readFilter` (Object):          Object mapping filtering profiles to string arrays of allowed fields.  Used when reading
                                 a doc - useful for GET queries that must return only selected fields.
- `writeFilter` (Object):         As above, but used when when applied during a PUT or POST.  This filters fields out of a given
                                 object so they will not be written even when specified.
                                 Useful for protected attributes like fb.accessToken.
- `defaultFilterRole` (String)(default: 'nofilter'):   Profile to use when one is not given, or the given profile does not exist.
- `sanitize` (Boolean)(default: false):           True to automatically escape HTML in strings.

### Statics

This plugin adds the following statics to your schema:

- `getReadFilterKeys(filterRole)`
- `getWriteFilterKeys(filterRole)`
- `applyReadFilter(input, filterRole)`
- `applyWriteFilter(input, filterRole`
- `_applyFilter(input, filterKeys)     // private helper`
- `_getFilterKeys(type, filterRole)    // private helper`

### Methods

This plugin adds the following methods to your schema:

- `extendWithWriteFilter(input, filterRole)`
- `applyReadFilter(filterRole)         // convenience method, calls statics.applyReadFilter`
- `applyWriteFilter(filterRole)        // convenience method, calls statics.applyWriteFilter`

## Denormalize Usage

Denormalization functionality is provided via a schema plugin.
This plugin has support for, but does not require, the filter.js plugin in the same package.

### Schema

```javascript
var denormalize = require('mongoose-filter-denormalize').denormalize;
var ObjectId = mongoose.Schema.ObjectId;
var UserSchema = new Mongoose.schema({
  name            :   String,
  transactions    :   [{type:ObjectId, ref:'Transaction'}],
  address         :   {type:ObjectId, ref:'Address'},
  tickets         :   [{type:ObjectId, ref:'Ticket'}],
  bankaccount     :   {type:ObjectId, ref:'BankAccount'}
});

// Running .denormalize() during a query will by default denormalize the selected defaults.
// Excluded collections are never denormalized, even when asked for.
// This is useful if passing query params directly to your methods.
UserSchema.plugin(denormalize, {defaults: ['address', 'transactions', 'tickets'],
                                exclude: 'bankaccount'});
```

### Querying

```javascript
// Create a query.
// The 'conditions' object allows you to query on denormalized objects!
var opts = {
  refs: ["transactions", "address"],    // Denormalize these refs. If blank, will use defaults
  filter: "public";                     // Filter requires use of filter.js and profiles
  conditions: {
    address: {city : {$eq: "Seattle"}}  // Only return the user if he is in Seattle
  }
};
User.findOne({name: 'Foo Bar'}).denormalize(opts).run(function(err, user){
  if(err) next(err);
  res.send({success: true, users: [user]});
});
```

### Options

* `exclude`  (String[] or String):  References to never denormalize, even when explicitly asked
                                   Use this when generating refs programmatically, to prevent unintended leakage.
* `defaults` (String[] or String):  References to denormalize when called without options.
                                   Defaults to all refs (except those in 'exclude').  Useful to define
                                   this if you have hasMany references that can easily get large.
* `suffix`   (String):              A suffix to add to all denormalized objects. This is not yet supported in Mongoose
                                   but hopefully will be soon. E.g. a suffix of '_obj' would denormalize the story.comment
                                   object to story.comment_obj, leaving the id in story.comment. This is necessary
                                   for compatibility with ExtJS.

### Notes

If you are building your array of refs to denormalize programmatically, make sure it returns
an empty array if you do not want it to denormalize - falsy values will cause this plugin
to use defaults.

## Credits

[Mongoose](https://github.com/LearnBoost/mongoose)


## License

Copyright (C) 2012 by Samuel T. Reed <samuel.trace.reed@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

