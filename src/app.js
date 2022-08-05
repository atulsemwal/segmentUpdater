const express = require("express");
const path = require("path");
const axios = require("axios");
// const hbs = require("hbs")
// const { registerPartials } = require("hbs");
const app = express();
let port = process.env.PORT;
if (port == null || port == "") {
  port = 8000;
}
app.listen(port);

//setting the path
const staticpath = path.join(__dirname, "../public");
const templatespath = path.join(__dirname, "../templates/views");
const partialspath = path.join(__dirname, "../templates/partials");


//middleware
app.use(
  "/css",
  express.static(path.join(__dirname, "../node_modules/bootstrap/dist/css"))
);
app.use(
  "/js",
  express.static(path.join(__dirname, "../node_modules/bootstrap/dist/js"))
);
app.use(
  "/jq",
  express.static(path.join(__dirname, "../node_modules/jquery/dist"))
);
app.use(express.urlencoded({ extended: false }));
app.use(express.static(staticpath));
app.set("view engine", "ejs");
app.set("views", templatespath);

//routing
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/doc", (req, res) => {
  res.render("doc");
});

app.get("/aboutme", (req, res) => {
  res.render("aboutme");
});

app.post("/updater", async (req, res) => {
  try {
    const userData = req.body;
    module.exports = userData;

    ///adobe updater
    const token = req.body.token;
    const global_company_id = req.body.companyID;
    const api_key = req.body.APIKey;

    var conditions = [
      {
        old: req.body.old, //reqular expression can be used,
        new: req.body.new,
        func: req.body.func,
        dimen_to_update: req.body.dimen_to_update,
      },
      {
        old: "test",
        new: "wow",
        func: "add_and_replace",
        dimen_to_update: "Page Name",
      },
    ];
    var updated = [];
    /// bulk update SEGMENT with api
    function update(segment_id, seg) {
      var data = JSON.stringify(seg);

      var update_config = {
        method: "put",
        url:
          "https://analytics.adobe.io/api/" +
          global_company_id +
          "/segments/" +
          segment_id +
          "?locale=en_US&expansion=definition",
        headers: {
          Authorization: "Bearer " + token,
          "x-proxy-global-company-id": global_company_id,
          "x-api-key": api_key,
          "Content-Type": "application/json",
        },
        data: data,
      };

      axios(update_config)
        .then(function (response) {
          var seg_name = JSON.stringify(response.data.name);
        })
        .catch(function (error) {
          console.log(error);
        });
    }

    // bulk retrive and update the segment
    //1. Authorization for retriving
    var retrive_config = {
      method: "get",
      url:
        "https://analytics.adobe.io/api/" +
        global_company_id +
        "/segments?locale=en_US&filterByPublishedSegments=all&limit=50&page=0&sortDirection=ASC&sortProperty=id&expansion=definition",
      headers: {
        Authorization: "Bearer " + token,
        "x-proxy-global-company-id": global_company_id,
        "x-api-key": api_key,
      },
    };

    async function adobeUpdater() {
      //2. Retriving bulk segment data
      await axios(retrive_config)
        .then(async function (response) {
          var res = response.data;
          // Url of segment definition data structure https://developer.adobe.com/analytics-apis/docs/2.0/guides/endpoints/segments/definition/
          //checking how the container is grouped
          // looping to get an individual segment
          res.content.forEach((seg) => {
            var seg_definition_contain = seg.definition.container;
            //each container has func, context(vistors,visit,hits)and pred (logic of this container)
            var seg_definition_contain_pred = seg_definition_contain.pred;
            var seg_definition_contain_pred_func =
              seg_definition_contain_pred.func;

            //add change log to description
            seg.description =
              seg.description +
              "\n Updated on " +
              new Date().toLocaleDateString() +
              "\n";
            conditions.forEach((condition, i) => {
              var no = i + 1;
              seg.description =
                seg.description +
                " " +
                no +
                ". " +
                condition.func +
                " from " +
                condition.old +
                " to " +
                condition.new +
                " on these dimension (" +
                condition.dimen_to_update +
                ")\n";
            });

            //1. when there is not a 'container', 'or' and 'and' .i.e single defination segment
            if (
              seg_definition_contain_pred_func != "container" &&
              seg_definition_contain_pred_func != "or" &&
              seg_definition_contain_pred_func != "and" &&
              seg_definition_contain_pred_func != "sequence"
            ) {
              //update the segment
              update_segment(seg_definition_contain);
            }

            //2. updating if sequential segment used
            if (seg_definition_contain_pred_func == "sequence") {
              //loop through the sequential segment container data
              sequen_update(seg_definition_contain_pred.stream);
            }

            //3. updating if 'or' or 'and' function used
            if (
              seg_definition_contain_pred_func == "or" ||
              seg_definition_contain_pred_func == "and"
            ) {
              or_and(seg_definition_contain_pred);
            }

            //4. updating if container function used
            if (seg_definition_contain_pred_func == "container") {
              update_container(seg_definition_contain_pred);
            }
            // console.log(seg.name)
            updated.push(seg.name);
            var segment_id = seg.id; // pulling segment id to update a particular segment
            // console.log(JSON.stringify(seg, null, 2))
            // console.log("//new segment..................")
            update(segment_id, seg);
          });

          //function update segment with no container
          function update_segment(pred) {
            for (const condition of conditions) {
              switch (condition.func) {
                case "replace":
                case "regex":
                  if (pred.hasOwnProperty("preds")) {
                    pred_replace(pred, condition);
                  } else if (!pred.hasOwnProperty("preds")) {
                    if (!pred.hasOwnProperty("pred")) {
                      pred.pred = find_replace(condition, pred.pred);
                    } else if (!pred.pred.hasOwnProperty("preds")) {
                      pred.pred = find_replace(condition, pred.pred);
                    } else if (pred.pred.hasOwnProperty("preds")) {
                      pred_replace(pred.pred, condition);
                    }
                  }
                  break;
                case "add_and_replace":
                  //checking if we can look through the cotainer
                  if (pred.hasOwnProperty("preds")) {
                    //loop though each element
                    pred.preds = pred.preds.flatMap((element) => {
                      // if the function is or and and
                      if (
                        element.func != "container" &&
                        element.func != "or" &&
                        element.func != "and" &&
                        element.func != "sequence" &&
                        !element.hasOwnProperty("list") &&
                        !element.hasOwnProperty("evt") &&
                        !element.hasOwnProperty("num") &&
                        !element.func.includes("exist") &&
                        !element.func.includes("datetime")
                      ) {
                        //checking it's glob or str
                        var check_str = "";
                        if (element.hasOwnProperty("str")) {
                          check_str = element.str;
                        } else {
                          check_str = element.glob;
                        }
                        // checking if itr should updated the dimen
                        if (
                          check_str.includes(condition.old) &&
                          element.description == condition.dimen_to_update
                        ) {
                          let replace_dimen = find_replace(condition, element);
                          return [element, replace_dimen];
                        } else {
                          return element;
                        }
                      } else if (
                        element.func == "or" &&
                        element.func == "and"
                      ) {
                        let replace_element = or_and(element);
                        return replace_element;
                      } else if (element.hasOwnProperty("pred")) {
                        if (
                          element.pred.func == "and" ||
                          element.pred.func == "or"
                        ) {
                          let replace_element = or_and(element.pred);
                          return replace_element;
                        } else if (element.pred.func == "sequence") {
                          let replace_sequence = JSON.parse(
                            JSON.stringify(element)
                          );
                          replace_sequence.pred.stream = sequen_update(
                            element.pred.stream
                          );
                          return replace_sequence;
                        } else if (element.pred.func == "container") {
                          let replace_container = update_container(element);
                          return replace_container;
                        } else {
                          return element;
                        }
                      } else {
                        return element;
                      }
                    });
                  } else if (!pred.hasOwnProperty("preds")) {
                    if (pred.hasOwnProperty("pred")) {
                      if (
                        pred.pred.func != "container" &&
                        pred.pred.func != "or" &&
                        pred.pred.func != "and" &&
                        pred.pred.func != "sequence" &&
                        !pred.pred.func.includes("without") &&
                        !pred.pred.hasOwnProperty("list") &&
                        !pred.pred.hasOwnProperty("event") &&
                        !pred.pred.hasOwnProperty("evt") &&
                        !pred.pred.hasOwnProperty("num") &&
                        !pred.pred.func.includes("exist") &&
                        !pred.pred.func.includes("datetime")
                      ) {
                        if (pred.pred.hasOwnProperty("str")) {
                          check_str = pred.pred.str;
                        } else {
                          check_str = pred.pred.glob;
                        }
                        if (
                          check_str.includes(condition.old) &&
                          pred.pred.description == condition.dimen_to_update
                        ) {
                          if (!pred.pred.hasOwnProperty("preds")) {
                            var dimen = pred;
                            var replace_pred = find_replace(
                              condition,
                              dimen.pred
                            );
                            dimen.pred = {
                              func: "or",
                              preds: [dimen.pred, replace_pred],
                            };
                            // remove description auto generated
                            if (dimen.description == "AUTO_GENERATED") {
                              delete dimen["description"];
                            }
                          }
                        }
                      } else {
                        if (
                          pred.pred.description == condition.dimen_to_update
                        ) {
                          if (
                            !pred.pred.hasOwnProperty("preds") &&
                            !pred.pred.hasOwnProperty("list") &&
                            !pred.pred.hasOwnProperty("event") &&
                            !pred.pred.hasOwnProperty("evt") &&
                            !pred.pred.hasOwnProperty("num") &&
                            !pred.pred.func.includes("exist") &&
                            !pred.pred.func.includes("datetime")
                          ) {
                            var dimen = pred;
                            var replace_pred = find_replace(
                              condition,
                              dimen.pred
                            );
                            dimen.pred = {
                              func: "or",
                              preds: [dimen.pred, replace_pred],
                            };
                            // remove description auto generated
                            if (dimen.description == "AUTO_GENERATED") {
                              delete dimen["description"];
                            }
                          } else if (pred.pred.hasOwnProperty("list")) {
                            if (pred.pred.list.includes(condition.old)) {
                              var dimen = pred;
                              var replace_pred = find_replace(
                                condition,
                                dimen.pred
                              );
                              dimen.pred = {
                                func: "or",
                                preds: [dimen.pred, replace_pred],
                              };
                              // remove description auto generated
                              if (dimen.description == "AUTO_GENERATED") {
                                delete dimen["description"];
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  break;
              }
            }
            return pred;
          }

          // function pred replace
          function pred_replace(pred, condition) {
            pred.preds = pred.preds.map((element) => {
              //if and and or function
              if (
                element.func != "container" &&
                element.func != "and" &&
                element.func != "or" &&
                element.func != "sequence" &&
                !element.hasOwnProperty("list") &&
                !element.hasOwnProperty("evt") &&
                !element.hasOwnProperty("event") &&
                !element.hasOwnProperty("num") &&
                !element.func.includes("exist") &&
                !element.func.includes("datetime")
              ) {
                //checking it's glob or str
                var check_str = "";
                if (element.hasOwnProperty("str")) {
                  check_str = element.str;
                } else {
                  check_str = element.glob;
                }
                // checking if itr should updated the dimen
                if (
                  check_str.includes(condition.old) &&
                  element.description == condition.dimen_to_update
                ) {
                  let replace_dimen = find_replace(condition, element);
                  return replace_dimen;
                } else if (
                  element.description == condition.dimen_to_update &&
                  condition.func == "regex"
                ) {
                  let replace_dimen = find_replace(condition, element);
                  return replace_dimen;
                } else {
                  return element;
                }
              } else if (element.func == "container") {
                let updated_container = update_container(element);
                return updated_container;
              } else if (element.func == "or" || element.func == "and") {
                let replace_element = or_and(element);
                return replace_element;
              } else {
                return element;
              }
            });
          }
          //find and replace function. It takes two argument. Conditon define my users and dimen i.e dimension to change
          function find_replace(condition, dimen) {
            replace_dimen_def = condition;
            let replace_dimen = JSON.parse(JSON.stringify(dimen));
            //checking if there is no temporal, numeric && existence function
            if (
              !dimen.hasOwnProperty("evt") &&
              !dimen.hasOwnProperty("event") &&
              !dimen.hasOwnProperty("num") &&
              !dimen.func.includes("exist") &&
              !dimen.func.includes("without") &&
              !dimen.func.includes("datetime")
            ) {
              //checking if the new deminsion defination does not contain wildcard
              if (replace_dimen_def.new.includes("*")) {
                // checking if deminsion contains equal

                if (dimen.func == "streq") {
                  // change the function to matches and str key
                  dimen.func = "matches";
                  dimen["glob"] = dimen["str"];
                  delete dimen["str"];
                  var re_old = new RegExp(replace_dimen_def.old);
                  replace_dimen.glob = replace_dimen.glob.replace(
                    re_old,
                    replace_dimen_def.new
                  );
                  return replace_dimen;
                }
              }

              //if dimension contains matches
              if (dimen.func == "matches") {
                var re_old = new RegExp(replace_dimen_def.old);
                replace_dimen.glob = replace_dimen.glob.replace(
                  re_old,
                  replace_dimen_def.new
                );
                return replace_dimen;
              }

              //if dimension does not contains matches
              if (dimen.func != "matches") {
                if (dimen.hasOwnProperty("list")) {
                  let arr_to_replace = [...dimen.list];
                  arr_to_replace.forEach((element, i) => {
                    var re_old = new RegExp(replace_dimen_def.old);
                    arr_to_replace[i] = arr_to_replace[i].replace(
                      re_old,
                      replace_dimen_def.new
                    );
                  });
                  replace_dimen.list = arr_to_replace;
                  return replace_dimen;
                } else {
                  var re_old = new RegExp(replace_dimen_def.old);
                  replace_dimen.str = replace_dimen.str.replace(
                    re_old,
                    replace_dimen_def.new
                  );
                  return replace_dimen;
                }
              }
            } else if (dimen.func.includes("without")) {
              replace_dimen = update_container(replace_dimen);
              return replace_dimen;
            } else {
              return replace_dimen;
            }
          }

          // function to update sequential segment
          function sequen_update(stream_data) {
            var stm = stream_data;
            stm.forEach((sequen_obj) => {
              var sequn_obj_pred = sequen_obj.pred;
              if (
                !sequen_obj.func.includes("restriction") &&
                sequen_obj.func != "exclude-next-checkpoint"
              ) {
                // while loop check:
                //1. if sub function is 'or' or 'and'. Call the or_and function
                if (
                  sequn_obj_pred.func == "or" ||
                  sequn_obj_pred.func == "and"
                ) {
                  or_and(sequn_obj_pred);
                } else if (
                  sequn_obj_pred.func != "or" &&
                  sequn_obj_pred.func != "and" &&
                  sequn_obj_pred.func != "container" &&
                  sequn_obj_pred.func != "sequence"
                ) {
                  update_segment(sequen_obj);
                } else if (sequen_obj.func == "container") {
                  update_container(sequen_obj);
                }
              }
            });
            return stream_data;
          }
          //function update segment with container
          function update_container(dimen) {
            var dimen_pred = dimen.pred;
            var dimen_pred_func = dimen_pred.func;
            //1. when 'or' and 'and'
            if (dimen_pred_func == "or" || dimen_pred_func == "and") {
              or_and(dimen_pred); //2. when does not equal 'or', 'and' and 'container
            } else if (
              dimen_pred_func != "or" &&
              dimen_pred_func != "and" &&
              dimen_pred_func != "container" &&
              dimen_pred_func != "sequence" &&
              dimen_pred_func != "without"
            ) {
              update_segment(dimen); //3.. when sequential container
            } else if (dimen_pred_func == "sequence") {
              // sequen_update
              sequen_update(dimen_pred.stream);
            } else if (
              dimen_pred_func == "container" ||
              dimen_pred_func == "without"
            ) {
              update_container(dimen.pred);
            }
            return dimen;
          }

          //function for 'or' and 'and' segment
          function or_and(pred) {
            //don't want to make it loop here update it directly ......
            let updated_segment = update_segment(pred);
            return updated_segment;
          }
        })
        .catch(function (error) {
            var error_exist = [];
            // return error_exist
          res.send(error.response.data)
        });
    //   console.log(error_exist);
      res.render("updater", { updated: updated });
    }
    adobeUpdater();
  } catch (error) {
    res.status(500).send(error);
  }
});
//server create
app.listen(port, () => {
  console.log(`server is running at  ${port}`);
});
