import 'babel-polyfill';
import access from 'safe-access';

/*global performance */
/*eslint-disable no-console */

let UNDEFINED;
const EXPR_REGEX = /\{{2}([^{}]+)\}{2}/;
const LOOP_REGEX = /#(.+)\s+of\s+(.+)/;
const CONDITION = '*if';
const LOOP = '*repeat';
const EXPR = 'expression';

function _skip_node(node) {
  const next = node.nextSibling;
  if (!next) {
    return _skip_node(node.parentNode);
  }
  return next;
}
function _retire(node) {
  if (node.parentNode) {
    // gently retire a node
    node.parentNode.replaceChild(document.createComment('REMOVED'), node);
  }
}

function* traverse(root, isExclusive=false) {

  const treeWalker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // bypass whitespaces
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let node = isExclusive? treeWalker.nextNode() : treeWalker.currentNode;
  let nextNode;

  while (node) {
    switch (node.nodeType) {

      case Node.ELEMENT_NODE: {
        const attrs = node.attributes;
        for (let i = 0, attr; i < attrs.length; i++) {
          attr = attrs[i];

          // block statement
          if (attr.name === CONDITION || attr.name === LOOP) {
            yield {
              op: attr.name,
              node,
              expr: attr.value
            };

            // skip element block for the next interpolation
            nextNode = _skip_node(node);
          } else {
            const match = attr.value.match(EXPR_REGEX);
            // insist on full match for attribute interpolation
            if (match && match.input.length === match[0].length)
              yield {
                op: EXPR,
                node: attr,
                expr: match[1]
              };
          }
        }
        break;
      }

      case Node.TEXT_NODE: {
        const match = node.textContent.match(EXPR_REGEX);
        if (match) {

          const length = match[0].length;

          // split up text node here for better
          // interpolation performance
          if (match.index > 0) {
            node = node.splitText(match.index);
            // forward the walker
            nextNode = node;
          }

          // same split here
          if (node.textContent.length > length) {
            node.splitText(length);
          }

          yield {
            op: EXPR,
            node,
            expr: match[1]
          };
        }
        break;
      }
    }

    // handle manual walker forwarding
    if (!nextNode) {
      nextNode = treeWalker.nextNode();
    } else {
      treeWalker.currentNode = nextNode;
    }

    node = nextNode;
    nextNode = null;
  }
}

function loop(scope, expr, fn) {
  const match = expr.match(LOOP_REGEX);
  if(match) {
    const iterVar = match[1];
    const collection = access(scope, match[2]);
    if (iterVar && Array.isArray(collection)) {
      collection.forEach((item, i) => {
        const scope = {$index: i + 1,};
        scope[iterVar] = item;
        fn(scope);
      });
    }
  }
}

function interpolate({op, node, expr}, scope) {
  let sum = 0;
  switch (op) {
    case EXPR: {
      const val = access(scope, expr);
      if (val !== UNDEFINED) {
        switch (node.nodeType) {
          case Node.ATTRIBUTE_NODE: {
            node.ownerElement.setAttribute(node.nodeName, val);
            break;
          }

          case Node.TEXT_NODE: {
            node.nodeValue = val;
            break;
          }
        }
      }
      break;
    }

    case CONDITION: {
      const condition = access(scope, expr);
      if(condition) {
        // if control doesn't alter scope
        sum = render(node, scope, true /*exclusive*/);
      } else {
        _retire(node);
      }
      
      break;
    }

    case LOOP: {

      // parse block internal
      let itemFrag, listFrag;
      const children = node.childNodes;

      loop(scope, expr, itemScope => {

        if (!itemFrag) {
          itemFrag = document.createDocumentFragment();
          while(children.length>0) {
            itemFrag.appendChild(children[0]);
          }
        }

        const perItemFrag = itemFrag.cloneNode(true);
        sum += render(perItemFrag, itemScope, true /*exclusive*/);

        if (!listFrag) {
          listFrag = document.createDocumentFragment();
        }

        listFrag.appendChild(perItemFrag);
      });

      listFrag? node.appendChild(listFrag) : _retire(node);
      
      break;
    }
  }
  return sum || 1;
}

// Perf tracking / hide DOM constructing from view
function sink(fn) {
  return function($el) {
    const t0 = performance.now();
    const older = $el.style.visibility;
    $el.style.visibility = 'hidden';
    const sum = fn.apply(this, arguments);
    const t1 = performance.now() - t0;
    console.log(`interpolated ${sum} expressions in ${t1} ms.`);
    $el.style.visibility = older;
  };
}

function render($el, scope, isExclusive) {
  return Array.from(traverse($el, isExclusive)).reduce((sum, op)=> {
    sum+= interpolate(op, scope);
    return sum;
  }, 0);
}

module.exports = sink(render);