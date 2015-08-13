import {Container} from 'aurelia-dependency-injection';
import {View} from './view';
import {ViewSlot} from './view-slot';
import {ContentSelector} from './content-selector';
import {ViewResources} from './view-resources';
import {BehaviorInstruction, TargetInstruction} from './instructions';

function elementContainerGet(key){
  if(key === Element){
    return this.element;
  }

  if(key === BoundViewFactory){
    if(this.boundViewFactory){
      return this.boundViewFactory;
    }

    var factory = this.instruction.viewFactory,
        partReplacements = this.partReplacements;

    if(partReplacements){
      factory = partReplacements[factory.part] || factory;
    }

    return this.boundViewFactory = new BoundViewFactory(this, factory, this.executionContext, partReplacements);
  }

  if(key === ViewSlot){
    if(this.viewSlot === undefined){
      this.viewSlot = new ViewSlot(this.element, this.instruction.anchorIsContainer, this.executionContext);
      this.children.push(this.viewSlot);
    }

    return this.viewSlot;
  }

  if(key === ViewResources){
    return this.viewResources;
  }

  if(key === TargetInstruction){
    return this.instruction;
  }

  return this.superGet(key);
}

function createElementContainer(parent, element, instruction, executionContext, children, partReplacements, resources){
  var container = parent.createChild(),
                  providers,
                  i;

  container.element = element;
  container.instruction = instruction;
  container.executionContext = executionContext;
  container.children = children;
  container.viewResources = resources;
  container.partReplacements = partReplacements;

  providers = instruction.providers;
  i = providers.length;

  while(i--) {
    container.registerSingleton(providers[i]);
  }

  container.superGet = container.get;
  container.get = elementContainerGet;

  return container;
}

function makeElementIntoAnchor(element, elementInstruction){
  var anchor = document.createComment('anchor');

  if(elementInstruction){
    anchor.hasAttribute = function(name) { return element.hasAttribute(name); };
    anchor.getAttribute = function(name){ return element.getAttribute(name); };
    anchor.setAttribute = function(name, value) { element.setAttribute(name, value); };
  }

  element.parentNode.replaceChild(anchor, element);

  return anchor;
}

function applyInstructions(containers, executionContext, element, instruction,
  behaviors, bindings, children, contentSelectors, partReplacements, resources){
  var behaviorInstructions = instruction.behaviorInstructions,
      expressions = instruction.expressions,
      elementContainer, i, ii, current, instance;

  if(instruction.contentExpression){
    bindings.push(instruction.contentExpression.createBinding(element.nextSibling));
    element.parentNode.removeChild(element);
    return;
  }

  if(instruction.contentSelector){
    var commentAnchor = document.createComment('anchor');
    element.parentNode.replaceChild(commentAnchor, element);
    contentSelectors.push(new ContentSelector(commentAnchor, instruction.selector));
    return;
  }

  if(behaviorInstructions.length){
    if(!instruction.anchorIsContainer){
      element = makeElementIntoAnchor(element, instruction.elementInstruction);
    }

    containers[instruction.injectorId] = elementContainer =
      createElementContainer(
        containers[instruction.parentInjectorId],
        element,
        instruction,
        executionContext,
        children,
        partReplacements,
        resources
        );

    for(i = 0, ii = behaviorInstructions.length; i < ii; ++i){
      current = behaviorInstructions[i];
      instance = current.type.create(elementContainer, current, element, bindings, current.partReplacements);

      if(instance.contentView){
        children.push(instance.contentView);
      }

      behaviors.push(instance);
    }
  }

  for(i = 0, ii = expressions.length; i < ii; ++i){
    bindings.push(expressions[i].createBinding(element));
  }
}

function styleStringToObject(style, target) {
    var attributes = style.split(';'),
        firstIndexOfColon, i, current, key, value;

    target = target || {};

    for(i = 0; i < attributes.length; i++) {
      current = attributes[i];
      firstIndexOfColon = current.indexOf(":");
      key = current.substring(0, firstIndexOfColon).trim();
      value = current.substring(firstIndexOfColon + 1).trim();
      target[key] = value;
    }

    return target;
}

function styleObjectToString(obj){
  let result = '';

  for(let key in obj){
    result += key + ':' + obj[key] + ';';
  }

  return result;
}

function applySurrogateInstruction(container, element, instruction, behaviors, bindings, children){
  let behaviorInstructions = instruction.behaviorInstructions,
      expressions = instruction.expressions,
      providers = instruction.providers,
      values = instruction.values,
      i, ii, current, instance, currentAttributeValue, styleParts;

  i = providers.length;
  while(i--) {
    container.registerSingleton(providers[i]);
  }

  //apply surrogate attributes
  for(let key in values){
    currentAttributeValue = element.getAttribute(key);

    if(currentAttributeValue){
      if(key === 'class'){
        if(currentAttributeValue !== 'au-target'){
          //merge the surrogate classes
          element.setAttribute('class', currentAttributeValue + ' ' + values[key]);
        }
      }else if(key === 'style'){
        //merge the surrogate styles
        let styleObject = styleStringToObject(values[key]);
        styleStringToObject(currentAttributeValue, styleObject);
        element.setAttribute('style', styleObjectToString(styleObject));
      }

      //otherwise, do not overwrite the consumer's attribute
    }else{
      //copy the surrogate attribute
      element.setAttribute(key, values[key]);
    }
  }

  //apply surrogate behaviors
  if(behaviorInstructions.length){
    for(i = 0, ii = behaviorInstructions.length; i < ii; ++i){
      current = behaviorInstructions[i];
      instance = current.type.create(container, current, element, bindings, current.partReplacements);

      if(instance.contentView){
        children.push(instance.contentView);
      }

      behaviors.push(instance);
    }
  }

  //apply surrogate bindings
  for(i = 0, ii = expressions.length; i < ii; ++i){
    bindings.push(expressions[i].createBinding(element));
  }
}

export class BoundViewFactory {
  constructor(parentContainer:Container, viewFactory:ViewFactory, executionContext:Object, partReplacements?:Object){
    this.parentContainer = parentContainer;
    this.viewFactory = viewFactory;
    this.executionContext = executionContext;
    this.factoryCreateInstruction = { partReplacements:partReplacements };
  }

  create(executionContext?:Object):View{
    var childContainer = this.parentContainer.createChild(),
        context = executionContext || this.executionContext;

    this.factoryCreateInstruction.systemControlled = !executionContext;

    return this.viewFactory.create(childContainer, context, this.factoryCreateInstruction);
  }
}

export class ViewFactory{
  constructor(template:DocumentFragment, instructions:Object, resources:ViewResources){
    this.template = template;
    this.instructions = instructions;
    this.resources = resources;
  }

  create(container:Container, executionContext?:Object, createInstruction?:ViewCreateInstruction, element?:Element):View{
    createInstruction = createInstruction || BehaviorInstruction.normal;
    element = element || null;

    let fragment = createInstruction.enhance ? this.template : this.template.cloneNode(true),
        instructables = fragment.querySelectorAll('.au-target'),
        instructions = this.instructions,
        resources = this.resources,
        behaviors = [],
        bindings = [],
        children = [],
        contentSelectors = [],
        containers = { root:container },
        partReplacements = createInstruction.partReplacements,
        i, ii, view, instructable, instruction;

    if(element !== null && this.surrogateInstruction !== null){
      applySurrogateInstruction(container, element, this.surrogateInstruction, behaviors, bindings, children);
    }

    for(i = 0, ii = instructables.length; i < ii; ++i){
      instructable = instructables[i];
      instruction = instructions[instructable.getAttribute('au-target-id')];

      applyInstructions(containers, executionContext, instructable,
        instruction, behaviors, bindings, children, contentSelectors, partReplacements, resources);
    }

    view = new View(container, fragment, behaviors, bindings, children, createInstruction.systemControlled, contentSelectors);

    //if iniated by an element behavior, let the behavior trigger this callback once it's done creating the element
    if(!createInstruction.initiatedByBehavior){
      view.created();
    }

    //if the view creation is part of a larger creation, wait to bind until the root view initiates binding
    if(!createInstruction.suppressBind){
      view.bind(executionContext);
    }

    return view;
  }
}
