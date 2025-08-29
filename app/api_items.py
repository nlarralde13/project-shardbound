from flask import Blueprint, request, jsonify
import uuid
from .models import db, Item, ItemInstance, CharacterInventory, Character

api_bp = Blueprint('api_items', __name__)

@api_bp.route('/items', methods=['POST'])
def upsert_item():
    data = request.get_json(force=True) or {}
    required = ['item_id', 'item_version', 'name', 'type', 'rarity', 'stack_size', 'base_stats']
    if not all(k in data for k in required):
        return jsonify(error='missing required fields'), 400
    item = Item.query.get(data['item_id'])
    if not item:
        item = Item(item_id=data['item_id'])
        db.session.add(item)
    item.item_version = data['item_version']
    item.name = data['name']
    item.type = data['type']
    item.rarity = data['rarity']
    item.stack_size = int(data['stack_size'])
    item.base_stats = data['base_stats']
    db.session.commit()
    return jsonify({
        'item_id': item.item_id,
        'item_version': item.item_version,
        'name': item.name,
        'type': item.type,
        'rarity': item.rarity,
        'stack_size': item.stack_size,
        'base_stats': item.base_stats,
    }), 201

@api_bp.route('/item_instances', methods=['POST'])
def mint_item_instance():
    data = request.get_json(force=True) or {}
    item_id = data.get('item_id')
    item_version = data.get('item_version')
    quantity = data.get('quantity', 1)
    if not item_id or not item_version:
        return jsonify(error='item_id and item_version required'), 400
    try:
        quantity = int(quantity)
    except Exception:
        return jsonify(error='quantity must be integer'), 400
    if quantity < 1:
        return jsonify(error='quantity must be >= 1'), 400
    item = Item.query.get(item_id)
    if not item:
        return jsonify(error='item not found'), 404
    instance = ItemInstance(
        instance_id=str(uuid.uuid4()),
        item_id=item_id,
        item_version=item_version,
        quantity=quantity,
    )
    db.session.add(instance)
    db.session.commit()
    return jsonify({
        'instance_id': instance.instance_id,
        'item_id': instance.item_id,
        'item_version': instance.item_version,
        'quantity': instance.quantity,
    }), 201

@api_bp.route('/characters/<character_id>/inventory', methods=['POST'])
def grant_item(character_id):
    data = request.get_json(force=True) or {}
    character = Character.query.get(character_id)
    if not character:
        return jsonify(error='character not found'), 404
    slot_index = data.get('slot_index')
    item_id = data.get('item_id')
    instance_id = data.get('instance_id')
    qty = data.get('qty', 1)
    equipped = bool(data.get('equipped', False))
    if slot_index is None or item_id is None or instance_id is None:
        return jsonify(error='slot_index, item_id, and instance_id required'), 400
    try:
        slot_index = int(slot_index)
        qty = int(qty)
    except Exception:
        return jsonify(error='slot_index and qty must be integers'), 400
    if qty < 1:
        return jsonify(error='qty must be >= 1'), 400
    item = Item.query.get(item_id)
    if not item:
        return jsonify(error='item not found'), 404
    inst = ItemInstance.query.get(instance_id)
    if not inst:
        return jsonify(error='item instance not found'), 404
    existing = CharacterInventory.query.filter_by(character_id=character_id, slot_index=slot_index).first()
    if existing:
        return jsonify(error='slot already occupied'), 400
    inv = CharacterInventory(
        id=str(uuid.uuid4()),
        character_id=character_id,
        slot_index=slot_index,
        item_id=item_id,
        instance_id=instance_id,
        qty=qty,
        equipped=equipped,
    )
    db.session.add(inv)
    db.session.commit()
    return jsonify({
        'id': inv.id,
        'character_id': inv.character_id,
        'slot_index': inv.slot_index,
        'item_id': inv.item_id,
        'instance_id': inv.instance_id,
        'qty': inv.qty,
        'equipped': inv.equipped,
    }), 201
